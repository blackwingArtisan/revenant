import type { Acks } from './alerts';
import { MINUTE } from './time';
import type { Commitment, PlannedPage, Settings } from './types';

/** How many of a routine's most recent answered leave-now pages are looked at. */
export const LEARN_WINDOW = 3;
/** How many of those must have been answered late before the pager suggests anything. */
export const LEARN_LATE_NEEDED = 2;
/** Suggested prep times are whole minutes, rounded up to this step. */
export const PREP_STEP_MIN = 5;
/** The pager never suggests more than this much prep. */
export const MAX_PREP_MIN = 120;

export interface LearnInput {
  /** Every planned page, including past days. */
  pages: readonly PlannedPage[];
  commitments: readonly Commitment[];
  /** ACK time per page id, from the runtime state. */
  acks: Acks;
  settings: Settings;
  /** Epoch ms. A leave-now page is "missed" once this is at or past its cutoff. */
  now: number;
  /** Per routine: pages that fired before this instant are ignored (set when a suggestion was applied). */
  ignoreBefore?: Readonly<Record<string, number>>;
}

export interface PrepSuggestion {
  /** Identifies the routine: same title at the same place. */
  routineKey: string;
  /** The most recent commitment of the routine that has an answered leave-now page. */
  commitmentId: string;
  /** Every appointment of the routine, so the app can update the ones that are still ahead. */
  commitmentIds: string[];
  title: string;
  currentPrepMinutes: number;
  suggestedPrepMinutes: number;
  /** Late answers among `sampled`. */
  lateCount: number;
  sampled: number;
}

/**
 * Commitments repeat (a weekly appointment, the same errand typed again), but
 * each one has its own id and its own leave-now page. A routine is the same
 * title at the same place; that is what the pager learns about.
 */
export function routineKey(c: Pick<Commitment, 'title' | 'placeId'>): string {
  return `${c.title.trim().toLowerCase().replace(/\s+/g, ' ')}|${c.placeId ?? ''}`;
}

interface Outcome {
  fireAt: number;
  late: boolean;
  /** Minutes the person was late, only meaningful when `late`. */
  lateMinutes: number;
  commitment: Commitment;
}

/**
 * The escalation level a page had reached when it was acknowledged (0 = first
 * beep, 1 = "STILL HERE?", 2 = "NOW!!"). A repeat due at the very instant of the
 * ACK counts: the pager delivers a due repeat before the person can press ACK.
 */
export function ackLevel(page: PlannedPage, ackAt: number): number {
  if (ackAt < page.fireAt) return 0;
  return page.escalateAt.filter((t) => t <= ackAt && t < page.cutoffAt).length;
}

/** A page nobody answered counts as at least as late as its last repeat. */
function missedLateMinutes(settings: Settings): number {
  return Math.max(PREP_STEP_MIN, ...settings.escalationMinutes);
}

function outcomeOf(page: PlannedPage, commitment: Commitment, acks: Acks, now: number, settings: Settings): Outcome | null {
  const ackAt = acks[page.id];
  if (ackAt === undefined) {
    if (now < page.cutoffAt) return null; // still open: no verdict yet
    return { fireAt: page.fireAt, late: true, lateMinutes: missedLateMinutes(settings), commitment };
  }
  const afterCutoff = ackAt >= page.cutoffAt;
  const late = afterCutoff || ackLevel(page, ackAt) >= 1;
  const lateMinutes = late ? Math.max(0, Math.min(ackAt, page.cutoffAt) - page.fireAt) / MINUTE : 0;
  return { fireAt: page.fireAt, late, lateMinutes, commitment };
}

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

/**
 * Suggest a longer prep time for routines whose leave-now page is usually
 * answered late. Pure and advisory: it returns suggestions and changes nothing.
 *
 * For each routine it takes the last {@link LEARN_WINDOW} leave-now pages that
 * have an answer (acknowledged, or missed) and suggests a new prep time when at
 * least {@link LEARN_LATE_NEEDED} were answered at escalation level 1 or later,
 * or missed. The new time is the current prep plus the average lateness,
 * rounded up to 5 minutes. Routines with no prep time are skipped, so applying a
 * suggestion moves an existing get-ready page and never adds a page.
 */
export function suggestPrepTimes(input: LearnInput): PrepSuggestion[] {
  const { settings, acks, now } = input;
  const byId = new Map(input.commitments.map((c) => [c.id, c]));
  const groups = new Map<string, Outcome[]>();

  for (const page of input.pages) {
    if (page.kind !== 'leave-now' || !page.commitmentId) continue;
    const commitment = byId.get(page.commitmentId);
    if (!commitment || commitment.kind !== 'appointment' || commitment.allDay) continue;
    const key = routineKey(commitment);
    if (page.fireAt < (input.ignoreBefore?.[key] ?? -Infinity)) continue;
    const outcome = outcomeOf(page, commitment, acks, now, settings);
    if (!outcome) continue;
    const list = groups.get(key) ?? [];
    list.push(outcome);
    groups.set(key, list);
  }

  const out: PrepSuggestion[] = [];
  for (const [key, all] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const recent = [...all].sort((a, b) => a.fireAt - b.fireAt || a.commitment.id.localeCompare(b.commitment.id)).slice(-LEARN_WINDOW);
    const late = recent.filter((o) => o.late);
    if (late.length < LEARN_LATE_NEEDED) continue;

    const latest = recent[recent.length - 1]!.commitment;
    const current = latest.prepMinutes;
    if (current <= 0 || current >= MAX_PREP_MIN) continue;

    const meanLate = late.reduce((sum, o) => sum + o.lateMinutes, 0) / late.length;
    const suggested = Math.min(MAX_PREP_MIN, Math.max(roundUp(current + meanLate, PREP_STEP_MIN), current + PREP_STEP_MIN));
    if (suggested <= current) continue;

    out.push({
      routineKey: key,
      commitmentId: latest.id,
      commitmentIds: input.commitments
        // Only commitments that already have a get-ready page: applying never adds one (Req 9.6).
        .filter((c) => c.kind === 'appointment' && !c.allDay && c.prepMinutes > 0 && routineKey(c) === key)
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
        .map((c) => c.id),
      title: latest.title,
      currentPrepMinutes: current,
      suggestedPrepMinutes: suggested,
      lateCount: late.length,
      sampled: recent.length,
    });
  }
  return out;
}
