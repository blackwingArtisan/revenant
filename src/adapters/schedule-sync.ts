import { alertsForPage, type Acks } from '../engine/alerts';
import { isEscalation } from '../engine/escalate';
import type { Alert, PlannedPage } from '../engine/types';

/** What has been handed to the remote scheduler: one signature per page id. */
export type ScheduledSet = Readonly<Record<string, string>>;

export interface ScheduleDiff {
  /** Pages whose pending remote schedules must be deleted first. */
  withdraw: string[];
  /** Alerts to schedule remotely. */
  create: Alert[];
  /** The scheduled set after applying this diff. */
  next: ScheduledSet;
}

/** Every beep a page would make if nobody acknowledged it. */
function fullRun(p: PlannedPage): Alert[] {
  return alertsForPage(p, undefined, Number.POSITIVE_INFINITY);
}

function signature(alerts: readonly Alert[]): string {
  return alerts.map((a) => `${a.id}@${a.at}:${a.code}:${a.text}`).join('|');
}

/**
 * Decide which pages to (re)schedule on a remote scheduler so they still go
 * out with the app closed. Pure: compares the plan against what was already
 * sent, so an unchanged plan sends nothing, a moved or reworded page is
 * withdrawn and scheduled again, and a page that left the plan is withdrawn.
 * Silent and acknowledged pages are never scheduled; only beeps still in the
 * future are sent.
 */
export function diffSchedules(prev: ScheduledSet, allPages: readonly PlannedPage[], acks: Acks, now: number): ScheduleDiff {
  // Escalation pages are on-screen only: they never enter the diff, so none is sent or withdrawn (Req 12.4).
  const pages = allPages.filter((p) => !isEscalation(p));
  const withdraw: string[] = [];
  const create: Alert[] = [];
  const next: Record<string, string> = {};
  const planned = new Set(pages.map((p) => p.id));

  for (const p of pages) {
    if (p.silent || acks[p.id] !== undefined) continue;
    const run = fullRun(p);
    const sig = signature(run);
    // A moved page is withdrawn even if all its new beeps are already past,
    // or the old schedule would still fire.
    if (prev[p.id] !== undefined && prev[p.id] !== sig) withdraw.push(p.id);
    const future = run.filter((a) => a.at > now);
    if (future.length === 0) continue;
    next[p.id] = sig;
    if (prev[p.id] !== sig) create.push(...future);
  }
  // A page that is gone from the plan (removed, or cut by the budget) must not fire.
  for (const id of Object.keys(prev)) {
    if (!planned.has(id)) withdraw.push(id);
  }
  create.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return { withdraw, create, next };
}
