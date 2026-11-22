import { alertsUpTo, pageStatus } from './alerts';
import { MISSED_CODE } from './codes';
import { isEscalation } from './escalate';
import type { RuntimeState } from './runtime';
import { addDays, HOUR, MINUTE, startOfDay } from './time';
import type { Commitment, DayPlan, PlannedPage } from './types';

/**
 * Pages you ignore come back the next morning. This module holds the pure parts:
 * which page the "ignore it" replay lets slip, the replayed day's state, the
 * next morning's 666 rebook page, and the call-to-rebook block that brings a
 * missed commitment back.
 */

/** The page a replay lets slip: the first must-go leave-now, else the first budgeted leave-now, else the first budgeted page. */
export function pickIgnoreTarget(day: DayPlan, commitments: readonly Commitment[]): PlannedPage | null {
  const loud = day.pages
    .filter((p) => p.countsToBudget && !p.silent && !isEscalation(p))
    .sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
  const priority = new Map(commitments.map((c) => [c.id, c.priority]));
  return (
    loud.find((p) => p.kind === 'leave-now' && p.commitmentId !== null && priority.get(p.commitmentId) === 'must') ??
    loud.find((p) => p.kind === 'leave-now') ??
    loud[0] ??
    null
  );
}

/**
 * The same day replayed with one page ignored: every other page is answered on
 * its first beep, the target is never answered, and every beep up to the end of
 * the day counts as delivered, so jumping there plays no sound. Returns the
 * runtime state and the instant the day is over (when the 666 recap appears).
 */
export function ignoreReplay(day: DayPlan, targetPageId: string): { state: RuntimeState; dayOverAt: number } | null {
  const target = day.pages.find((p) => p.id === targetPageId);
  if (!target || isEscalation(target)) return null;
  const acks: Record<string, number> = {};
  // Escalation pages are never answered here: those of answered pages cancel themselves,
  // and the target's own escalation page stays unanswered so the secondary is paged.
  for (const p of day.pages) if (p.id !== targetPageId && !isEscalation(p)) acks[p.id] = p.fireAt;
  const dayOverAt = Math.max(...day.pages.filter((p) => !p.silent).map((p) => p.cutoffAt));
  const delivered = alertsUpTo(day.pages, acks, dayOverAt).map((a) => a.id);
  return { state: { acks, delivered }, dayOverAt };
}

export interface Rebook {
  /** Stable per missed day, so a choice made once stays made. */
  id: string;
  /** The day the pages were missed. */
  missedDayKey: string;
  /** When it shows: 7 AM the next morning. */
  at: number;
  code: string;
  /** Upper-case LCD text: "666 YESTERDAY: DENTIST CLEANING. REBOOK?" */
  text: string;
  /** Missed commitments, in fire order, each once. */
  commitmentIds: string[];
}

/**
 * The morning after a day with missed budgeted pages, the first thing the pager
 * shows is a 666 asking to rebook. Only pages that actually beeped count: a day
 * the pager was not running has nothing to haunt. Pure.
 */
export function rebookPage(missedDay: DayPlan, runtime: RuntimeState, commitments: readonly Commitment[], timeZone: string, now: number): Rebook | null {
  const nextDay = addDays(missedDay.dayKey, 1);
  const at = startOfDay(nextDay, timeZone) + 7 * HOUR;
  if (now < at) return null;
  const titles = new Map(commitments.map((c) => [c.id, c.title]));
  const ids: string[] = [];
  for (const p of [...missedDay.pages].sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id))) {
    if (!p.countsToBudget || p.silent || isEscalation(p) || p.commitmentId === null || ids.includes(p.commitmentId)) continue;
    const beeped = runtime.delivered.some((id) => id.startsWith(`${p.id}#`));
    if (beeped && pageStatus(p, runtime.acks, now) === 'missed') ids.push(p.commitmentId);
  }
  if (ids.length === 0) return null;
  const first = (titles.get(ids[0]!) ?? 'A PAGE').toUpperCase();
  const more = ids.length > 1 ? ` +${ids.length - 1} MORE` : '';
  return {
    id: `rebook:${missedDay.dayKey}`,
    missedDayKey: missedDay.dayKey,
    at,
    code: MISSED_CODE,
    text: `${MISSED_CODE} YESTERDAY: ${first}${more}. REBOOK?`,
    commitmentIds: ids,
  };
}

/**
 * Resurrect a missed commitment: a 15-minute body-double block to call and
 * rebook it, at 9 AM on the given day (or 15 minutes from now if that has
 * passed). It pages 121 like any focus block and counts toward the budget.
 */
export function resurrection(missed: Commitment, onDayKey: string, timeZone: string, now: number, id: string): Commitment {
  const nineAm = startOfDay(onDayKey, timeZone) + 9 * HOUR;
  const start = nineAm > now ? nineAm : Math.ceil((now + 15 * MINUTE) / (5 * MINUTE)) * 5 * MINUTE;
  return {
    id,
    title: `Call to rebook: ${missed.title}`,
    kind: 'focus',
    start,
    end: start + 15 * MINUTE,
    placeId: null,
    prepMinutes: 0,
    priority: 'normal',
    checkInEveryMinutes: null,
    source: 'manual',
  };
}
