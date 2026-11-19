import { describe, expect, it } from 'vitest';
import { ackLevel, routineKey, suggestPrepTimes, type LearnInput } from '../../src/engine/learn';
import { planDays } from '../../src/engine/plan';
import type { Commitment, PlannedPage } from '../../src/engine/types';
import { appt, at, M, PLACES, settings } from './helpers';

const DAYS = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
// Default settings: 20 min travel + 5 min buffer, so a 10:30 start pages leave-now at 10:05,
// repeats at 10:08, 10:11 and 10:15, and the page is moot at 10:30.
const LEAVE = (day: string) => at(day, 10, 5);

function routine(days: string[], overrides: Partial<Commitment> = {}): Commitment[] {
  return days.map((d) => appt({ id: `dentist-${d}`, title: 'Dentist', start: at(d, 10, 30), prepMinutes: 15, ...overrides }));
}

function leaveNow(commitments: Commitment[], days: string[] = DAYS): PlannedPage[] {
  return planDays({ commitments, places: PLACES, settings: settings(), travelMinutes: {}, dayKeys: days }).pages.filter((p) => p.kind === 'leave-now');
}

/** ACK each day's leave-now page `after[i]` minutes after it fired (undefined = never answered). */
function acksAfter(days: string[], after: (number | undefined)[]): Record<string, number> {
  const acks: Record<string, number> = {};
  days.forEach((d, i) => {
    const m = after[i];
    if (m !== undefined) acks[`dentist-${d}:leave-now`] = LEAVE(d) + m * M;
  });
  return acks;
}

function input(commitments: Commitment[], acks: Record<string, number>, now = at('2026-11-20', 8), extra: Partial<LearnInput> = {}): LearnInput {
  return { pages: leaveNow(commitments), commitments, acks, settings: settings(), now, ...extra };
}

describe('learning from late ACKs', () => {
  it('suggests nothing without history', () => {
    expect(suggestPrepTimes(input([], {}))).toEqual([]);
    const one = routine(DAYS.slice(0, 1));
    expect(suggestPrepTimes(input(one, acksAfter(DAYS, [5])))).toEqual([]);
  });

  it('suggests nothing when every ACK came on the first beep', () => {
    const c = routine(DAYS.slice(0, 3));
    expect(suggestPrepTimes(input(c, acksAfter(DAYS, [0, 1, 2])))).toEqual([]);
  });

  it('works out the escalation level an ACK came at', () => {
    const [page] = leaveNow(routine(['2026-11-19']));
    const fire = page!.fireAt;
    expect(ackLevel(page!, fire)).toBe(0);
    expect(ackLevel(page!, fire + 3 * M - 1)).toBe(0); // answered just before the +3 repeat
    expect(ackLevel(page!, fire + 3 * M)).toBe(1); // the +3 repeat was delivered at that instant: "STILL HERE?"
    expect(ackLevel(page!, fire + 7 * M)).toBe(2); // "NOW!!"
    expect(ackLevel(page!, fire + 20 * M)).toBe(3);
  });

  it('suggests a longer prep when 2 of the last 3 ACKs came at level 1 or later', () => {
    const days = DAYS.slice(0, 3);
    const c = routine(days);
    // +4 min (level 1), +1 min (on time), +7 min (level 2): mean lateness 5.5 min, so 15 + 5.5 = 20.5, rounded up to 25.
    const [s, ...rest] = suggestPrepTimes(input(c, acksAfter(days, [4, 1, 7])));
    expect(rest).toEqual([]);
    expect(s).toMatchObject({
      commitmentId: 'dentist-2026-11-18',
      title: 'Dentist',
      currentPrepMinutes: 15,
      suggestedPrepMinutes: 25,
      lateCount: 2,
      sampled: 3,
    });
    expect(s!.commitmentIds).toEqual(days.map((d) => `dentist-${d}`));
  });

  it('needs two late answers, not one', () => {
    const c = routine(DAYS.slice(0, 3));
    expect(suggestPrepTimes(input(c, acksAfter(DAYS, [7, 0, 1])))).toEqual([]);
  });

  it('only looks at the last three answered pages', () => {
    const c = routine(DAYS);
    // The first two were late but are older than the window; the last three were on time.
    expect(suggestPrepTimes(input(c, acksAfter(DAYS, [7, 7, 0, 0])))).toEqual([]);
    // The window slides: the last three are 7, 0 and 7.
    expect(suggestPrepTimes(input(c, acksAfter(DAYS, [0, 7, 0, 7])))).toHaveLength(1);
  });

  it('counts a missed page as late, at the length of the last repeat', () => {
    const c = routine(DAYS.slice(0, 3));
    // Two pages nobody answered and one on time. Lateness = last escalation offset (10 min): 15 + 10 = 25.
    const [s] = suggestPrepTimes(input(c, acksAfter(DAYS, [undefined, 0, undefined])));
    expect(s).toMatchObject({ suggestedPrepMinutes: 25, lateCount: 2, sampled: 3 });
  });

  it('does not judge a page that is still paging', () => {
    const c = routine(DAYS.slice(0, 2));
    const midway = at(DAYS[1]!, 10, 20); // second page is open until 10:30
    expect(suggestPrepTimes(input(c, acksAfter(DAYS, [undefined]), midway))).toEqual([]);
    // Once it goes moot unanswered, it counts.
    expect(suggestPrepTimes(input(c, acksAfter(DAYS, [undefined]), at(DAYS[1]!, 10, 30)))).toHaveLength(1);
  });

  it('counts an ACK after the cutoff as late', () => {
    const c = routine(DAYS.slice(0, 2));
    const acks = acksAfter(DAYS, [40, 40]);
    expect(suggestPrepTimes(input(c, acks))[0]).toMatchObject({ lateCount: 2, suggestedPrepMinutes: 40 });
  });

  it('rounds up to 5 minutes and always suggests more than the current prep', () => {
    const days = DAYS.slice(0, 2);
    // Two ACKs 4 min after the page: 12 + 4 = 16 -> 20.
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 12 }), acksAfter(days, [4, 4])))[0]?.suggestedPrepMinutes).toBe(20);
    // 15 + 5 = 20 exactly stays 20.
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 15 }), acksAfter(days, [5, 5])))[0]?.suggestedPrepMinutes).toBe(20);
    // 20 + 3.5 = 23.5 -> 25.
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 20 }), acksAfter(days, [3.5, 3.5])))[0]?.suggestedPrepMinutes).toBe(25);
    // 20 + 5 = 25 -> 25; and when rounding would not exceed the current time, it still moves up one step.
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 20 }), acksAfter(days, [5, 5])))[0]?.suggestedPrepMinutes).toBe(25);
  });

  it('never suggests more than two hours of prep', () => {
    const days = DAYS.slice(0, 2);
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 118 }), acksAfter(days, [9, 9])))[0]?.suggestedPrepMinutes).toBe(120);
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 120 }), acksAfter(days, [9, 9])))).toEqual([]);
  });

  it('skips routines with no prep time, so it never adds a page', () => {
    const days = DAYS.slice(0, 3);
    expect(suggestPrepTimes(input(routine(days, { prepMinutes: 0 }), acksAfter(days, [7, 7, 7])))).toEqual([]);
  });

  it('leaves out a routine member with no prep time, so applying the suggestion adds no get-ready page', () => {
    // Found by the learner property in properties.test.ts: a zero-prep visit ahead in the same routine.
    const c = [...routine(DAYS.slice(0, 3)), appt({ id: 'dentist-next', title: 'Dentist', start: at('2026-11-23', 10, 30), prepMinutes: 0 })];
    const [s] = suggestPrepTimes(input(c, acksAfter(DAYS, [5, 5, 0])));
    expect(s?.commitmentIds).toEqual(['dentist-2026-11-16', 'dentist-2026-11-17', 'dentist-2026-11-18']);
  });

  it('gives at most one suggestion per routine, and one for each routine that qualifies', () => {
    const dentist = routine(DAYS);
    const gym = DAYS.map((d) => appt({ id: `gym-${d}`, title: 'Gym', placeId: 'gym', start: at(d, 17), prepMinutes: 10 }));
    const acks: Record<string, number> = { ...acksAfter(DAYS, [7, 7, 7, 7]) };
    for (const p of leaveNow(gym)) acks[p.id] = p.fireAt + 4 * M;
    const out = suggestPrepTimes(input([...dentist, ...gym], acks));
    expect(out.map((s) => s.title)).toEqual(['Dentist', 'Gym']);
    expect(new Set(out.map((s) => s.routineKey)).size).toBe(2);
    expect(routineKey(dentist[0]!)).toBe(routineKey({ title: '  DENTIST ', placeId: 'dental' }));
  });

  it('ignores pages from before a suggestion was applied', () => {
    const days = DAYS.slice(0, 3);
    const c = routine(days);
    const acks = acksAfter(days, [7, 7, 7]);
    const key = routineKey(c[0]!);
    expect(suggestPrepTimes(input(c, acks))).toHaveLength(1);
    expect(suggestPrepTimes(input(c, acks, undefined, { ignoreBefore: { [key]: at('2026-11-19', 0) } }))).toEqual([]);
  });

  it('is deterministic, independent of input order, and changes nothing', () => {
    const days = DAYS.slice(0, 3);
    const c = routine(days);
    const acks = acksAfter(days, [4, 1, 7]);
    const a = input(c, acks);
    const before = JSON.stringify(a);
    const first = suggestPrepTimes(a);
    expect(suggestPrepTimes(a)).toEqual(first);
    expect(suggestPrepTimes({ ...a, pages: [...a.pages].reverse(), commitments: [...c].reverse() })).toEqual(first);
    expect(JSON.stringify(a)).toBe(before);
  });
});
