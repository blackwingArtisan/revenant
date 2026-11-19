import { describe, expect, it } from 'vitest';
import { planDays, type PlanInput } from '../../src/engine/plan';
import { sampleDay, SAMPLE_PLACES } from '../../src/engine/sample';
import { lcdClock } from '../../src/engine/time';
import { appt, at, M, PLACES, settings, TZ } from './helpers';

const DAY = '2026-11-19';

function input(overrides: Partial<PlanInput>): PlanInput {
  return { commitments: [], places: PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY], ...overrides };
}

describe('lead times', () => {
  it('pages get ready and leave now at the moment to act, not at the start', () => {
    const c = appt({ id: 'dentist', start: at(DAY, 10, 30), prepMinutes: 20 });
    const plan = planDays(input({ commitments: [c], travelMinutes: { dentist: 15 } }));
    const [ready, leave] = plan.pages;
    // leave = 10:30 - (15 travel + 5 buffer) = 10:10; ready = 10:10 - 20 * 1.5 = 9:40
    expect(leave?.kind).toBe('leave-now');
    expect(leave?.code).toBe('911');
    expect(leave?.fireAt).toBe(at(DAY, 10, 10));
    expect(ready?.kind).toBe('get-ready');
    expect(ready?.code).toBe('411');
    expect(ready?.fireAt).toBe(at(DAY, 9, 40));
    expect(leave?.text).toBe('LEAVE NOW: DENTIST @ 10:30A. 15 MIN AWAY');
    expect(ready?.text).toBe('GET READY: DENTIST 10:30A. LEAVE 10:10A');
  });

  it('applies the honesty factor to stated prep time', () => {
    const c = appt({ id: 'a', start: at(DAY, 10, 30), prepMinutes: 20 });
    const plan = planDays(input({ commitments: [c], travelMinutes: { a: 15 }, settings: settings({ honestyFactor: 1 }) }));
    expect(plan.pages[0]?.fireAt).toBe(at(DAY, 9, 50));
  });

  it('falls back to the default travel time when the adapter had no answer', () => {
    const c = appt({ id: 'a', start: at(DAY, 10, 30), prepMinutes: 0 });
    const plan = planDays(input({ commitments: [c] }));
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]?.fireAt).toBe(at(DAY, 10, 5)); // 20 default + 5 buffer
  });

  it('uses no travel for a video call and says JOIN', () => {
    const c = appt({ id: 'a', title: 'Stand-up', start: at(DAY, 9, 30), placeId: 'online', prepMinutes: 0 });
    const plan = planDays(input({ commitments: [c], travelMinutes: { a: 99 } }));
    expect(plan.pages[0]?.fireAt).toBe(at(DAY, 9, 25));
    expect(plan.pages[0]?.text).toBe('JOIN NOW: STAND-UP @ 9:30A');
  });

  it('schedules escalation repeats only until the page is moot', () => {
    const c = appt({ id: 'a', start: at(DAY, 10, 30), prepMinutes: 4 });
    const plan = planDays(input({ commitments: [c], travelMinutes: { a: 15 } }));
    const leave = plan.pages.find((p) => p.kind === 'leave-now')!;
    const ready = plan.pages.find((p) => p.kind === 'get-ready')!;
    expect(leave.escalateAt).toEqual([at(DAY, 10, 13), at(DAY, 10, 16), at(DAY, 10, 20)]);
    expect(leave.cutoffAt).toBe(at(DAY, 10, 30));
    // ready at 10:04, leave at 10:10: only the +3 repeat fits before leaving
    expect(ready.escalateAt).toEqual([at(DAY, 10, 7)]);
  });
});

describe('daily budget and digest', () => {
  it('never beeps more than the budget; the rest goes to one digest', () => {
    const commitments = [8, 10, 12, 14, 16].map((h, i) => appt({ id: `c${i}`, start: at(DAY, h), prepMinutes: 10 }));
    const plan = planDays(input({ commitments, settings: settings({ dailyBudget: 3 }) }));
    const day = plan.days[0]!;
    const beeping = day.pages.filter((p) => p.countsToBudget);
    expect(beeping).toHaveLength(3);
    expect(day.budget).toEqual({ limit: 3, used: 3 });
    // leave-now outranks get-ready, earliest first
    expect(beeping.every((p) => p.kind === 'leave-now')).toBe(true);
    expect(day.digest).toHaveLength(7);
    expect(day.digest.every((d) => d.reason === 'over-budget')).toBe(true);
    const digest = day.pages.filter((p) => p.kind === 'digest');
    expect(digest).toHaveLength(1);
    expect(digest[0]?.silent).toBe(true);
    expect(digest[0]?.code).toBe('100');
  });

  it('ranks must over normal', () => {
    const normal = appt({ id: 'normal', start: at(DAY, 9), prepMinutes: 0 });
    const must = appt({ id: 'must', start: at(DAY, 15), prepMinutes: 0, priority: 'must' });
    const plan = planDays(input({ commitments: [normal, must], settings: settings({ dailyBudget: 1 }) }));
    expect(plan.days[0]?.pages.filter((p) => p.countsToBudget).map((p) => p.id)).toEqual(['must:leave-now']);
  });

  it('keeps a page that already beeped even when a higher-priority one arrives', () => {
    const normal = appt({ id: 'normal', start: at(DAY, 9), prepMinutes: 0 });
    const must = appt({ id: 'must', start: at(DAY, 15), prepMinutes: 0, priority: 'must' });
    const plan = planDays(
      input({ commitments: [normal, must], settings: settings({ dailyBudget: 1 }), pinnedPageIds: ['normal:leave-now'] }),
    );
    expect(plan.days[0]?.pages.filter((p) => p.countsToBudget).map((p) => p.id)).toEqual(['normal:leave-now']);
  });

  it('never beeps for low-priority or all-day commitments', () => {
    const low = appt({ id: 'gym', title: 'Gym', start: at(DAY, 18), placeId: 'gym', priority: 'low' });
    const allDay = appt({ id: 'trash', title: 'Trash night', start: at(DAY, 0), placeId: null, allDay: true, priority: 'low' });
    const plan = planDays(input({ commitments: [low, allDay] }));
    const day = plan.days[0]!;
    expect(day.pages.map((p) => p.kind)).toEqual(['digest']);
    expect(day.digest.map((d) => d.reason)).toEqual(['all-day', 'low-priority']);
    expect(day.pages[0]?.text).toContain('TODAY TRASH NIGHT');
  });

  it('moves the digest earlier when an item comes before the configured time', () => {
    const early = appt({ id: 'early', title: 'Early run', start: at(DAY, 7, 0), placeId: null, prepMinutes: 0, priority: 'low' });
    const plan = planDays(input({ commitments: [early] }));
    expect(plan.days[0]?.pages[0]?.fireAt).toBe(at(DAY, 5, 55)); // item at 6:55, one hour before
  });

  it('does not let an all-day item drag the digest to midnight', () => {
    const allDay = appt({ id: 'trash', title: 'Trash night', start: at(DAY, 0), placeId: null, allDay: true, priority: 'low' });
    const plan = planDays(input({ commitments: [allDay] }));
    expect(plan.days[0]?.pages[0]?.fireAt).toBe(at(DAY, 7, 30));
  });

  it('puts the digest at the configured time otherwise', () => {
    const low = appt({ id: 'gym', start: at(DAY, 18), priority: 'low' });
    const plan = planDays(input({ commitments: [low] }));
    expect(plan.days[0]?.pages[0]?.fireAt).toBe(at(DAY, 7, 30));
  });

  it('budgets each local day separately', () => {
    const today = appt({ id: 'today', start: at(DAY, 10), prepMinutes: 0 });
    const tomorrow = appt({ id: 'tomorrow', start: at('2026-11-20', 10), prepMinutes: 0 });
    const plan = planDays(input({ commitments: [today, tomorrow], dayKeys: [DAY, '2026-11-20'], settings: settings({ dailyBudget: 1 }) }));
    expect(plan.days.map((d) => d.budget.used)).toEqual([1, 1]);
    expect(plan.pages).toHaveLength(2);
  });
});

describe('body double', () => {
  it('pages a focus block at its start, every check-in, and the wrap-up', () => {
    const focus = appt({
      id: 'taxes',
      title: 'Taxes',
      kind: 'focus',
      start: at(DAY, 13),
      end: at(DAY, 14),
      placeId: null,
      prepMinutes: 0,
      checkInEveryMinutes: 25,
    });
    const plan = planDays(input({ commitments: [focus] }));
    expect(plan.pages.map((p) => [p.kind, lcdClock(p.fireAt, TZ)])).toEqual([
      ['focus-start', '1:00P'],
      ['check-in', '1:25P'],
      ['check-in', '1:50P'],
      ['wrap-up', '2:00P'],
    ]);
    expect(plan.pages[0]?.code).toBe('121');
    expect(plan.pages[1]?.text).toBe('STILL ON TAXES? 35 MIN LEFT');
    // only the start counts against the budget, and only the start repeats
    expect(plan.days[0]?.budget.used).toBe(1);
    expect(plan.pages.slice(1).every((p) => p.escalateAt.length === 0)).toBe(true);
  });

  it('drops the check-ins when the focus start is over budget', () => {
    const must = appt({ id: 'must', start: at(DAY, 9), prepMinutes: 0, priority: 'must' });
    const focus = appt({ id: 'f', kind: 'focus', start: at(DAY, 13), end: at(DAY, 14), placeId: null, checkInEveryMinutes: 20 });
    const plan = planDays(input({ commitments: [must, focus], settings: settings({ dailyBudget: 1 }) }));
    expect(plan.pages.map((p) => p.kind)).toEqual(['digest', 'leave-now']);
  });
});

describe('time zones and daylight saving', () => {
  it('counts lead time in real minutes across the spring-forward gap', () => {
    // 3:30 AM CDT on 8 March; 2:00-3:00 AM does not exist that night.
    const flight = appt({ id: 'f', title: 'Airport', start: at('2026-03-08', 3, 30), prepMinutes: 40 });
    const plan = planDays(
      input({ commitments: [flight], dayKeys: ['2026-03-08'], travelMinutes: { f: 30 }, settings: settings({ honestyFactor: 1 }) }),
    );
    const [ready, leave] = plan.pages;
    expect(leave?.fireAt).toBe(flight.start - 35 * M);
    expect(ready?.fireAt).toBe(flight.start - 75 * M);
    // On the wall clock that is 1:55 and 1:15, an hour "earlier" than the arithmetic suggests.
    expect(lcdClock(leave!.fireAt, TZ)).toBe('1:55A');
    expect(lcdClock(ready!.fireAt, TZ)).toBe('1:15A');
  });

  it('keeps both ends of a 25-hour fall-back day in one budget', () => {
    const early = appt({ id: 'early', start: at('2026-11-01', 1, 0) + 60 * M, prepMinutes: 0 }); // second 1:00 AM (CST)
    const late = appt({ id: 'late', start: at('2026-11-01', 23, 50), prepMinutes: 0, placeId: 'online' });
    const plan = planDays(input({ commitments: [early, late], dayKeys: ['2026-11-01'], settings: settings({ dailyBudget: 1 }) }));
    expect(plan.days[0]?.budget.used).toBe(1);
    expect(plan.days[0]?.digest).toHaveLength(1);
  });

  it('plans in the configured zone, not the machine zone', () => {
    const tokyo = appt({ id: 't', start: at(DAY, 10, 0, 'Asia/Tokyo'), prepMinutes: 0, placeId: 'online' });
    const plan = planDays(input({ commitments: [tokyo], settings: settings({ timeZone: 'Asia/Tokyo' }) }));
    expect(lcdClock(plan.pages[0]!.fireAt, 'Asia/Tokyo')).toBe('9:55A');
    expect(plan.pages[0]?.dayKey).toBe(DAY);
  });
});

describe('determinism', () => {
  it('produces the same plan for the same input, in any order', () => {
    const commitments = sampleDay(DAY, TZ);
    const base = { places: SAMPLE_PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY] };
    const a = planDays({ ...base, commitments });
    const b = planDays({ ...base, commitments: [...commitments].reverse() });
    expect(b).toEqual(a);
  });

  it('turns the over-full sample day into six beeps and a digest', () => {
    const plan = planDays({ places: SAMPLE_PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY], commitments: sampleDay(DAY, TZ) });
    const day = plan.days[0]!;
    expect(day.budget.used).toBe(6);
    expect(day.digest.map((d) => [d.title, d.reason])).toEqual([
      ['Trash and recycling night', 'all-day'],
      ['Pick up prescription', 'low-priority'],
      ['Gym', 'low-priority'],
      ["Dinner at Morgan's", 'over-budget'],
    ]);
    expect(day.pages.filter((p) => p.countsToBudget).map((p) => p.id)).toEqual([
      'sample-standup:leave-now',
      'sample-dentist:get-ready',
      'sample-dentist:leave-now',
      'sample-taxes:focus-start',
      'sample-pickup:leave-now',
      'sample-dinner:leave-now',
    ]);
  });
});
