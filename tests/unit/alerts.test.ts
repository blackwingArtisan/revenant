import { describe, expect, it } from 'vitest';
import { alertsUpTo, nextAlertAt, pageStatus } from '../../src/engine/alerts';
import { planDays } from '../../src/engine/plan';
import { acknowledge, activePages, alertTime, emptyRuntimeState, pinnedPageIds, rewind, tick } from '../../src/engine/runtime';
import { appt, at, M, PLACES, settings } from './helpers';

const DAY = '2026-11-19';
const leaveAt = at(DAY, 10, 10);

function pages() {
  const c = appt({ id: 'd', start: at(DAY, 10, 30), prepMinutes: 0 });
  return planDays({ commitments: [c], places: PLACES, settings: settings(), travelMinutes: { d: 15 }, dayKeys: [DAY] }).pages;
}

describe('escalation', () => {
  it('is silent before the page fires', () => {
    expect(alertsUpTo(pages(), {}, leaveAt - 1)).toEqual([]);
  });

  it('repeats an unanswered page, louder each time', () => {
    const alerts = alertsUpTo(pages(), {}, leaveAt + 7 * M);
    expect(alerts.map((a) => a.code)).toEqual(['911', '911 911', '911 911 911']);
    expect(alerts[1]?.text.startsWith('STILL HERE? ')).toBe(true);
  });

  it('stops repeating once acknowledged', () => {
    const alerts = alertsUpTo(pages(), { 'd:leave-now': leaveAt + 4 * M }, leaveAt + 30 * M);
    expect(alerts.map((a) => a.level)).toEqual([0, 1]);
  });

  it('stops repeating when the page is moot', () => {
    const alerts = alertsUpTo(pages(), {}, leaveAt + 60 * M);
    expect(alerts).toHaveLength(4); // 10:10, :13, :16, :20; the event starts 10:30
  });

  it('reports status through the life of a page', () => {
    const p = pages()[0]!;
    expect(pageStatus(p, {}, leaveAt - M)).toBe('scheduled');
    expect(pageStatus(p, {}, leaveAt + M)).toBe('paging');
    expect(pageStatus(p, { [p.id]: leaveAt + M }, leaveAt + 2 * M)).toBe('acked');
    expect(pageStatus(p, {}, at(DAY, 10, 30))).toBe('missed');
  });

  it('knows when the next beep is due, for the time machine', () => {
    expect(nextAlertAt(pages(), {}, at(DAY, 8))).toBe(leaveAt);
    expect(nextAlertAt(pages(), {}, leaveAt)).toBe(leaveAt + 3 * M);
    expect(nextAlertAt(pages(), { 'd:leave-now': leaveAt }, leaveAt)).toBeNull();
  });
});

describe('runtime', () => {
  it('delivers each alert once', () => {
    const first = tick(pages(), emptyRuntimeState(), leaveAt);
    expect(first.fresh.map((a) => a.id)).toEqual(['d:leave-now#0']);
    const again = tick(pages(), first.state, leaveAt + M);
    expect(again.fresh).toEqual([]);
  });

  it('coalesces repeats that came due during a time jump into one beep', () => {
    const r = tick(pages(), emptyRuntimeState(), leaveAt + 7 * M);
    expect(r.fresh.map((a) => a.code)).toEqual(['911 911 911']);
    expect(r.state.delivered).toHaveLength(3);
  });

  it('ACK cancels the escalation', () => {
    let state = tick(pages(), emptyRuntimeState(), leaveAt).state;
    state = acknowledge(state, 'd:leave-now', leaveAt + M);
    const later = tick(pages(), state, leaveAt + 15 * M);
    expect(later.fresh).toEqual([]);
    expect(activePages(pages(), later.state, leaveAt + 15 * M)).toEqual([]);
  });

  it('does not beep for pages that went moot while the app was closed', () => {
    const r = tick(pages(), emptyRuntimeState(), at(DAY, 11));
    expect(r.fresh).toEqual([]);
    expect(r.stale.length).toBeGreaterThan(0);
    expect(pageStatus(pages()[0]!, r.state.acks, at(DAY, 11))).toBe('missed');
  });

  it('lists beeping pages and pins them for re-planning', () => {
    const { state } = tick(pages(), emptyRuntimeState(), leaveAt + M);
    expect(activePages(pages(), state, leaveAt + M).map((p) => p.id)).toEqual(['d:leave-now']);
    expect(pinnedPageIds(state)).toEqual(['d:leave-now']);
  });

  it('keeps the first ACK time', () => {
    const s1 = acknowledge(emptyRuntimeState(), 'x', 5);
    expect(acknowledge(s1, 'x', 9).acks.x).toBe(5);
  });
});

describe('rewind', () => {
  it('forgets beeps and ACKs after the rewind point, so the day replays', () => {
    let state = tick(pages(), emptyRuntimeState(), leaveAt + 4 * M).state;
    state = acknowledge(state, 'd:leave-now', leaveAt + 5 * M);
    const back = rewind(pages(), state, leaveAt + 3 * M);
    expect(back.delivered).toEqual(['d:leave-now#0', 'd:leave-now#1']);
    expect(back.acks).toEqual({});
    const before = rewind(pages(), state, leaveAt - M);
    expect(before).toEqual({ acks: {}, delivered: [] });
    expect(tick(pages(), before, leaveAt).fresh.map((a) => a.id)).toEqual(['d:leave-now#0']);
  });

  it('drops delivered ids for pages that left the plan', () => {
    expect(alertTime(pages(), 'gone:leave-now#0')).toBeNull();
    expect(rewind(pages(), { acks: {}, delivered: ['gone:leave-now#0'] }, leaveAt).delivered).toEqual([]);
  });
});
