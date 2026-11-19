import { pageStatus, type Acks } from './alerts';
import { ackLevel } from './learn';
import { MISSED_CODE } from './codes';
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

/** Median notifications a phone delivers in a day (Pielot et al., MobileHCI 2018; see docs/evidence.md). */
export const TYPICAL_PHONE_NOTIFICATIONS = 56;

/** The silence budget, read back: how many interruptions the day did not have. */
export function silenceLine(r: DayReport): string {
  const spared = Math.max(0, TYPICAL_PHONE_NOTIFICATIONS - r.beeps);
  return `${r.beeps} beep${r.beeps === 1 ? '' : 's'} vs about ${TYPICAL_PHONE_NOTIFICATIONS} on a typical phone: ${spared} interruption${spared === 1 ? '' : 's'} you did not get.`;
}

export interface Haunting {
  /** Stable per day, so dismissing it once keeps it dismissed. */
  id: string;
  dayKey: string;
  /** When it appears: the moment the last beeping page of the day went moot. */
  at: number;
  code: string;
  /** Upper-case LCD text listing what slipped. */
  text: string;
  /** Ids of the missed pages, in fire order. */
  pageIds: string[];
}

/**
 * Pages you ignore come back to haunt you. Once the day is over (the same
 * moment as the receipt) and at least one budgeted page was missed, the pager
 * shows one silent 666 recap of what slipped. It never beeps and never counts
 * toward the budget. Null on a day with nothing missed. Pure.
 */
export function haunting(day: DayPlan, acks: Acks, now: number): Haunting | null {
  const report = dayReport(day, acks, now);
  if (!report || report.missed === 0) return null;
  const loud = day.pages.filter((p) => !p.silent);
  const missed = loud.filter((p) => p.countsToBudget && pageStatus(p, acks, now) === 'missed').sort((a, b) => a.fireAt - b.fireAt);
  return {
    id: `haunting:${day.dayKey}`,
    dayKey: day.dayKey,
    at: Math.max(...loud.map((p) => p.cutoffAt)),
    code: MISSED_CODE,
    text: `HAUNTING: ${missed.length} SLIPPED TODAY. ${missed.map((p) => p.text).join(' / ')}`,
    pageIds: missed.map((p) => p.id),
  };
}
