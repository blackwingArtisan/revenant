import { alertsUpTo, type Acks } from './alerts';
import type { Alert, PlannedPage } from './types';

export interface RuntimeState {
  acks: Record<string, number>;
  /** Alert ids already delivered (or skipped as stale), so nothing beeps twice. */
  delivered: string[];
}

export interface TickResult {
  /** Fresh alerts to beep now: at most one per page, the highest repeat level. */
  fresh: Alert[];
  /** Alerts that came due while the app was closed but are already moot. */
  stale: Alert[];
  state: RuntimeState;
}

export const emptyRuntimeState = (): RuntimeState => ({ acks: {}, delivered: [] });

/**
 * Advance the pager to `now`. Pure: returns the next state instead of
 * mutating. When the clock jumps (time travel, or the tab slept), several
 * repeats of one page may be due at once; only the latest one beeps.
 */
export function tick(pages: readonly PlannedPage[], state: RuntimeState, now: number): TickResult {
  const delivered = new Set(state.delivered);
  const due = alertsUpTo(pages, state.acks, now).filter((a) => !delivered.has(a.id));
  if (due.length === 0) return { fresh: [], stale: [], state };

  const byId = new Map(pages.map((p) => [p.id, p]));
  const latest = new Map<string, Alert>();
  const stale: Alert[] = [];
  for (const a of due) {
    delivered.add(a.id);
    const p = byId.get(a.pageId);
    if (!p || now >= p.cutoffAt) {
      stale.push(a);
      continue;
    }
    const prev = latest.get(a.pageId);
    if (!prev || a.level > prev.level) latest.set(a.pageId, a);
  }
  const fresh = [...latest.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return { fresh, stale, state: { ...state, delivered: [...delivered] } };
}

export function acknowledge(state: RuntimeState, pageId: string, now: number): RuntimeState {
  if (state.acks[pageId] !== undefined) return state;
  return { ...state, acks: { ...state.acks, [pageId]: now } };
}

/** Pages currently beeping: delivered, not acknowledged, not yet moot. Newest first. */
export function activePages(pages: readonly PlannedPage[], state: RuntimeState, now: number): PlannedPage[] {
  const delivered = new Set(state.delivered);
  const acks: Acks = state.acks;
  return pages
    .filter((p) => acks[p.id] === undefined && now >= p.fireAt && now < p.cutoffAt && delivered.has(`${p.id}#0`))
    .sort((a, b) => b.fireAt - a.fireAt || a.id.localeCompare(b.id));
}

/** Page ids that have beeped at least once; they keep their budget slot on re-plan. */
export function pinnedPageIds(state: RuntimeState): string[] {
  return [...new Set(state.delivered.map((id) => id.slice(0, id.lastIndexOf('#'))))];
}

/** When the alert with this id was due, or null if the page is no longer in the plan. */
export function alertTime(pages: readonly PlannedPage[], alertId: string): number | null {
  const hash = alertId.lastIndexOf('#');
  const pageId = alertId.slice(0, hash);
  const level = Number(alertId.slice(hash + 1));
  const p = pages.find((x) => x.id === pageId);
  if (!p) return null;
  return level === 0 ? p.fireAt : (p.escalateAt[level - 1] ?? null);
}

/**
 * Travel back in time: forget every beep and ACK that has not happened yet at
 * `to`, so replaying the day pages again exactly as it would have.
 */
export function rewind(pages: readonly PlannedPage[], state: RuntimeState, to: number): RuntimeState {
  const delivered = state.delivered.filter((id) => {
    const t = alertTime(pages, id);
    return t !== null && t <= to;
  });
  const acks = Object.fromEntries(Object.entries(state.acks).filter(([, t]) => t <= to));
  return { acks, delivered };
}
