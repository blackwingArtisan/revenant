import { escalatedCode } from './codes';
import type { Alert, PageStatus, PlannedPage } from './types';

/** Acknowledgement time per page id. */
export type Acks = Readonly<Record<string, number>>;

function alertFor(p: PlannedPage, level: number, at: number): Alert {
  const prefix = level === 0 ? '' : level === 1 ? 'STILL HERE? ' : 'NOW!! ';
  return {
    id: `${p.id}#${level}`,
    pageId: p.id,
    level,
    at,
    code: escalatedCode(p.code, level),
    text: prefix + p.text,
    silent: p.silent,
  };
}

/** Every beep a page has made up to `now`: the first one plus repeats until it is acknowledged or moot. */
export function alertsForPage(p: PlannedPage, ackAt: number | undefined, now: number): Alert[] {
  if (p.fireAt > now || p.fireAt >= p.cutoffAt) return [];
  if (ackAt !== undefined && ackAt < p.fireAt) return [];
  const out = [alertFor(p, 0, p.fireAt)];
  p.escalateAt.forEach((at, i) => {
    if (at > now || at >= p.cutoffAt) return;
    if (ackAt !== undefined && ackAt <= at) return;
    if (out.length === i + 1) out.push(alertFor(p, i + 1, at));
  });
  return out;
}

/** Every alert the plan has produced by `now`, oldest first. Pure. */
export function alertsUpTo(pages: readonly PlannedPage[], acks: Acks, now: number): Alert[] {
  return pages
    .flatMap((p) => alertsForPage(p, acks[p.id], now))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function pageStatus(p: PlannedPage, acks: Acks, now: number): PageStatus {
  if (acks[p.id] !== undefined) return 'acked';
  if (now < p.fireAt) return 'scheduled';
  if (now >= p.cutoffAt) return 'missed';
  return 'paging';
}

/** The next instant at which anything in the plan will beep (first page or repeat). */
export function nextAlertAt(pages: readonly PlannedPage[], acks: Acks, now: number): number | null {
  let best: number | null = null;
  for (const p of pages) {
    if (acks[p.id] !== undefined) continue;
    for (const t of [p.fireAt, ...p.escalateAt]) {
      if (t > now && t < p.cutoffAt && (best === null || t < best)) best = t;
    }
  }
  return best;
}
