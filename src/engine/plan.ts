import { CODE_FOR } from './codes';
import { addDays, lcdClock, localDayKey, MINUTE, startOfDay, zonedToEpoch, parseDayKey } from './time';
import type {
  Commitment,
  DayPlan,
  DigestItem,
  PageKind,
  Place,
  Plan,
  PlannedPage,
  Priority,
  Settings,
} from './types';

export interface PlanInput {
  commitments: Commitment[];
  places: Place[];
  settings: Settings;
  /** Travel minutes per commitment id, from the travel adapter. Missing ids use the default. */
  travelMinutes: Record<string, number>;
  /** Local days ("YYYY-MM-DD") to plan. */
  dayKeys: string[];
  /** Pages that have already beeped keep their budget slot when the plan changes. */
  pinnedPageIds?: Iterable<string>;
}

/** A focus block's first page is ignorable for this long before it counts as missed. */
export const FOCUS_START_GRACE_MIN = 20;
/** The digest moves earlier so it always lands this long before its first item. */
export const DIGEST_LEAD_MIN = 60;

const PRIORITY_RANK: Record<Priority, number> = { must: 0, normal: 1, low: 2 };
const KIND_RANK: Partial<Record<PageKind, number>> = { 'leave-now': 0, 'focus-start': 1, 'get-ready': 2 };

function upper(s: string): string {
  return s.trim().toUpperCase();
}

export function effectivePrepMinutes(prepMinutes: number, honestyFactor: number): number {
  return Math.max(0, Math.round(prepMinutes * honestyFactor));
}

/** Travel minutes the plan will use for one appointment. */
export function travelFor(c: Commitment, places: Map<string, Place>, input: Pick<PlanInput, 'travelMinutes' | 'settings'>): number {
  if (c.kind !== 'appointment' || !c.placeId) return 0;
  const place = places.get(c.placeId);
  if (!place || place.virtual) return 0;
  return Math.max(0, Math.round(input.travelMinutes[c.id] ?? input.settings.defaultTravelMinutes));
}

/** When the user must walk out the door. */
export function leaveTime(c: Commitment, travelMin: number, settings: Settings): number {
  return c.start - (travelMin + settings.bufferMinutes) * MINUTE;
}

function page(
  c: Commitment | null,
  kind: PageKind,
  fireAt: number,
  cutoffAt: number,
  text: string,
  settings: Settings,
  opts: { id?: string; escalates: boolean; countsToBudget: boolean; silent?: boolean },
): PlannedPage {
  const escalateAt = opts.escalates
    ? settings.escalationMinutes.map((m) => fireAt + m * MINUTE).filter((t) => t < cutoffAt)
    : [];
  return {
    id: opts.id ?? `${c?.id ?? 'none'}:${kind}`,
    commitmentId: c?.id ?? null,
    kind,
    code: CODE_FOR[kind],
    text,
    fireAt,
    escalateAt,
    cutoffAt,
    silent: opts.silent ?? false,
    countsToBudget: opts.countsToBudget,
    priority: c?.priority ?? 'low',
    dayKey: localDayKey(fireAt, settings.timeZone),
  };
}

/** Every page a commitment would produce if there were no budget. */
export function candidatePages(c: Commitment, places: Map<string, Place>, input: PlanInput): PlannedPage[] {
  const { settings } = input;
  const tz = settings.timeZone;
  const title = upper(c.title);
  if (c.allDay) return [];

  if (c.kind === 'focus') {
    const pages: PlannedPage[] = [];
    const startCutoff = Math.min(c.end, c.start + FOCUS_START_GRACE_MIN * MINUTE);
    pages.push(
      page(c, 'focus-start', c.start, startCutoff, `BODY DOUBLE: START ${title} TIL ${lcdClock(c.end, tz)}`, settings, {
        escalates: true,
        countsToBudget: true,
      }),
    );
    const every = c.checkInEveryMinutes;
    if (every && every > 0) {
      let n = 1;
      for (let t = c.start + every * MINUTE; t < c.end; t += every * MINUTE, n++) {
        const left = Math.round((c.end - t) / MINUTE);
        pages.push(
          page(c, 'check-in', t, Math.min(t + every * MINUTE, c.end), `STILL ON ${title}? ${left} MIN LEFT`, settings, {
            id: `${c.id}:check-in:${n}`,
            escalates: false,
            countsToBudget: false,
          }),
        );
      }
    }
    pages.push(
      page(c, 'wrap-up', c.end, c.end + 15 * MINUTE, `WRAP UP: ${title}. SAVE. STAND UP.`, settings, {
        escalates: false,
        countsToBudget: false,
      }),
    );
    return pages;
  }

  const travel = travelFor(c, places, input);
  const place = c.placeId ? places.get(c.placeId) : undefined;
  const verb = !place ? 'START' : place.virtual ? 'JOIN' : 'LEAVE';
  const leaveAt = leaveTime(c, travel, settings);
  const prep = effectivePrepMinutes(c.prepMinutes, settings.honestyFactor);
  const pages: PlannedPage[] = [];
  if (prep > 0) {
    const readyAt = leaveAt - prep * MINUTE;
    pages.push(
      page(c, 'get-ready', readyAt, leaveAt, `GET READY: ${title} ${lcdClock(c.start, tz)}. ${verb} ${lcdClock(leaveAt, tz)}`, settings, {
        escalates: true,
        countsToBudget: true,
      }),
    );
  }
  const leaveText =
    verb === 'LEAVE'
      ? `LEAVE NOW: ${title} @ ${lcdClock(c.start, tz)}. ${travel} MIN AWAY`
      : `${verb} NOW: ${title} @ ${lcdClock(c.start, tz)}`;
  pages.push(page(c, 'leave-now', leaveAt, c.start, leaveText, settings, { escalates: true, countsToBudget: true }));
  return pages;
}

function rankPages(a: PlannedPage, b: PlannedPage, pinned: Set<string>): number {
  const pa = pinned.has(a.id) ? 0 : 1;
  const pb = pinned.has(b.id) ? 0 : 1;
  return (
    pa - pb ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) ||
    a.fireAt - b.fireAt ||
    a.id.localeCompare(b.id)
  );
}

function digestTimeFor(dayKey: string, items: DigestItem[], settings: Settings): number {
  const tz = settings.timeZone;
  const dayStart = startOfDay(dayKey, tz);
  const configured = zonedToEpoch({ ...parseDayKey(dayKey), ...settings.digestTime }, tz);
  // All-day items have no time to act on, so they never pull the digest earlier.
  const timed = items.filter((i) => i.kind !== 'all-day').map((i) => i.at);
  const earliest = timed.length > 0 ? Math.min(...timed) : Infinity;
  return Math.max(dayStart, Math.min(configured, earliest - DIGEST_LEAD_MIN * MINUTE));
}

function digestText(items: DigestItem[], settings: Settings): string {
  const list = items.map((i) => `${i.kind === 'all-day' ? 'TODAY' : lcdClock(i.at, settings.timeZone)} ${upper(i.title)}`);
  return `DIGEST ${items.length}: ${list.join(' / ')}`;
}

/**
 * Turn commitments into the day's pages. Pure and deterministic: the same
 * input always produces the same plan.
 *
 * 1. Each commitment yields candidate pages (get ready, leave now, focus).
 * 2. Low-priority and all-day commitments never beep; they go to the digest.
 * 3. Per local day, at most `dailyBudget` pages beep. Pinned pages first,
 *    then must over normal, leave-now over focus-start over get-ready, then
 *    earliest. The rest go to the digest.
 * 4. Check-ins and wrap-ups ride along with their focus block's start page.
 * 5. Each day with digest items gets one silent digest page.
 */
export function planDays(input: PlanInput): Plan {
  const { settings } = input;
  const tz = settings.timeZone;
  const places = new Map(input.places.map((p) => [p.id, p]));
  const wanted = new Set(input.dayKeys);
  const pinned = new Set(input.pinnedPageIds ?? []);
  const byId = new Map(input.commitments.map((c) => [c.id, c]));

  const digestByDay = new Map<string, DigestItem[]>();
  const addDigest = (dayKey: string, item: DigestItem) => {
    if (!wanted.has(dayKey)) return;
    const list = digestByDay.get(dayKey) ?? [];
    list.push(item);
    digestByDay.set(dayKey, list);
  };

  const budgeted = new Map<string, PlannedPage[]>();
  const riders: PlannedPage[] = [];

  for (const c of [...input.commitments].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    if (c.allDay) {
      addDigest(localDayKey(c.start, tz), {
        pageId: null,
        commitmentId: c.id,
        title: c.title,
        at: c.start,
        reason: 'all-day',
        kind: 'all-day',
      });
      continue;
    }
    const pages = candidatePages(c, places, input);
    if (c.priority === 'low') {
      const first = pages[0];
      if (first) {
        const headline = pages.find((p) => p.kind === 'leave-now' || p.kind === 'focus-start') ?? first;
        addDigest(headline.dayKey, {
          pageId: null,
          commitmentId: c.id,
          title: c.title,
          at: headline.fireAt,
          reason: 'low-priority',
          kind: headline.kind,
        });
      }
      continue;
    }
    for (const p of pages) {
      if (p.countsToBudget) {
        const list = budgeted.get(p.dayKey) ?? [];
        list.push(p);
        budgeted.set(p.dayKey, list);
      } else {
        riders.push(p);
      }
    }
  }

  const kept: PlannedPage[] = [];
  const keptIds = new Set<string>();
  const used = new Map<string, number>();
  for (const [dayKey, list] of budgeted) {
    const ranked = [...list].sort((a, b) => rankPages(a, b, pinned));
    const limit = Math.max(0, Math.floor(settings.dailyBudget));
    ranked.forEach((p, i) => {
      if (i < limit) {
        keptIds.add(p.id);
        if (wanted.has(dayKey)) kept.push(p);
      } else {
        const c = p.commitmentId ? byId.get(p.commitmentId) : undefined;
        addDigest(dayKey, {
          pageId: p.id,
          commitmentId: p.commitmentId ?? '',
          title: c?.title ?? p.text,
          at: p.fireAt,
          reason: 'over-budget',
          kind: p.kind,
        });
      }
    });
    used.set(dayKey, Math.min(limit, ranked.length));
  }
  for (const r of riders) {
    if (r.commitmentId && keptIds.has(`${r.commitmentId}:focus-start`) && wanted.has(r.dayKey)) kept.push(r);
  }

  const days: DayPlan[] = input.dayKeys.map((dayKey) => {
    const digest = (digestByDay.get(dayKey) ?? []).sort((a, b) => a.at - b.at || a.commitmentId.localeCompare(b.commitmentId));
    const pages = kept.filter((p) => p.dayKey === dayKey);
    if (digest.length > 0) {
      const fireAt = digestTimeFor(dayKey, digest, settings);
      pages.push(
        page(null, 'digest', fireAt, startOfDay(addDays(dayKey, 1), tz), digestText(digest, settings), settings, {
          id: `digest:${dayKey}`,
          escalates: false,
          countsToBudget: false,
          silent: true,
        }),
      );
    }
    pages.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
    return { dayKey, pages, digest, budget: { limit: settings.dailyBudget, used: used.get(dayKey) ?? 0 } };
  });

  const pages = days.flatMap((d) => d.pages).sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
  return { days, pages };
}
