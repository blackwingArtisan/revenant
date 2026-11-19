import { pageStatus, type Acks } from './alerts';
import { ackLevel } from './learn';
import type { DayPlan } from './types';

export interface DayReport {
  dayKey: string;
  /** Budgeted pages that beeped, against the daily budget. */
  beeps: number;
  budget: number;
  /** Things that never beeped: everything in the quiet digest. */
  keptQuiet: number;
  /** Budgeted pages nobody answered. */
  missed: number;
  /** Budgeted pages answered on their first beep. */
  firstBeep: number;
}

/**
 * The end-of-day receipt: how many pages beeped, how many things stayed in the
 * quiet digest, and how many pages were missed. Null while any beeping page of
 * the day is still ahead or still waiting for an ACK. Pure.
 */
export function dayReport(day: DayPlan, acks: Acks, now: number): DayReport | null {
  const loud = day.pages.filter((p) => !p.silent);
  if (loud.length === 0) return null;
  const statuses = loud.map((p) => ({ p, status: pageStatus(p, acks, now) }));
  if (statuses.some(({ status }) => status === 'scheduled' || status === 'paging')) return null;
  const budgeted = statuses.filter(({ p }) => p.countsToBudget);
  return {
    dayKey: day.dayKey,
    beeps: budgeted.length,
    budget: day.budget.limit,
    keptQuiet: day.digest.length,
    missed: budgeted.filter(({ status }) => status === 'missed').length,
    firstBeep: budgeted.filter(({ p }) => {
      const ackAt = acks[p.id];
      return ackAt !== undefined && ackAt < p.cutoffAt && ackLevel(p, ackAt) === 0;
    }).length,
  };
}

/** "That was your day: 6 beeps, 4 kept quiet in the digest, 0 missed." */
export function dayReportLine(r: DayReport): string {
  return `That was your day: ${r.beeps} beep${r.beeps === 1 ? '' : 's'}, ${r.keptQuiet} kept quiet in the digest, ${r.missed} missed.`;
}
