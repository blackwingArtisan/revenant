import { describe, expect, it } from 'vitest';
import { ackLevel, suggestPrepTimes } from '../../src/engine/learn';
import { planDays } from '../../src/engine/plan';
import { dayReport, dayReportLine, haunting } from '../../src/engine/report';
import { isSampleHistory, sampleDay, sampleHistory, sampleWithHistory, SAMPLE_PLACES } from '../../src/engine/sample';
import { addDays } from '../../src/engine/time';
import { appt, at, M, PLACES, settings, TZ } from './helpers';

const DAY = '2026-11-19';

describe('end-of-day report', () => {
  const commitments = [appt({ id: 'a', start: at(DAY, 10, 30) }), appt({ id: 'b', start: at(DAY, 14, 0), priority: 'low' })];
  const day = () => planDays({ commitments, places: PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY] }).days[0]!;

  it('stays null while any beeping page is ahead or waiting for an ACK', () => {
    const d = day();
    expect(dayReport(d, {}, at(DAY, 6))).toBeNull();
    const ready = d.pages.find((p) => p.kind === 'get-ready')!;
    expect(dayReport(d, { [ready.id]: ready.fireAt }, at(DAY, 10, 6))).toBeNull();
  });

  it('counts beeps, things kept quiet and missed pages once the day is answered', () => {
    const d = day();
    const ready = d.pages.find((p) => p.kind === 'get-ready')!;
    const leave = d.pages.find((p) => p.kind === 'leave-now')!;
    const r = dayReport(d, { [ready.id]: ready.fireAt + M, [leave.id]: leave.escalateAt[0]! }, at(DAY, 11));
    expect(r).toEqual({ dayKey: DAY, beeps: 2, budget: 6, keptQuiet: 1, missed: 0, firstBeep: 1 });
    expect(dayReportLine(r!)).toBe('That was your day: 2 beeps, 1 kept quiet in the digest, 0 missed.');
    expect(ackLevel(leave, leave.escalateAt[0]!)).toBe(1);
  });

  it('counts a page nobody answered as missed once its cutoff passes', () => {
    const d = day();
    const ready = d.pages.find((p) => p.kind === 'get-ready')!;
    const r = dayReport(d, { [ready.id]: ready.fireAt }, at(DAY, 10, 30));
    expect(r).toMatchObject({ beeps: 2, missed: 1, firstBeep: 1 });
  });

  it('reports the full sample day as 6 beeps and 4 kept quiet', () => {
    const d = planDays({ commitments: sampleDay(DAY, TZ), places: SAMPLE_PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY] }).days[0]!;
    const acks = Object.fromEntries(d.pages.map((p) => [p.id, p.fireAt]));
    expect(dayReportLine(dayReport(d, acks, at(DAY, 23))!)).toBe('That was your day: 6 beeps, 4 kept quiet in the digest, 0 missed.');
  });

  it('has no report for a day with nothing that beeps', () => {
    const d = planDays({ commitments: [], places: PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY] }).days[0]!;
    expect(dayReport(d, {}, at(DAY, 23))).toBeNull();
  });
});

describe('sample history', () => {
  it('adds the weekly dinner on the two previous weeks, labelled as sample history', () => {
    const history = sampleHistory(DAY, TZ);
    expect(history.map((c) => c.id)).toEqual(['sample-history-dinner-14', 'sample-history-dinner-7']);
    expect(history.every((c) => isSampleHistory(c.id) && c.source === 'sample' && c.title === "Dinner at Morgan's")).toBe(true);
    expect(history[1]!.start).toBe(at(addDays(DAY, -7), 19, 30));
    expect(sampleDay(DAY, TZ).some((c) => isSampleHistory(c.id))).toBe(false);
  });

  it('gives the learner a suggestion on the sample day, before anything is answered', () => {
    const commitments = sampleWithHistory(DAY, TZ);
    const dayKeys = Array.from({ length: 15 }, (_, i) => addDays(DAY, i - 14));
    const { pages } = planDays({ commitments, places: SAMPLE_PLACES, settings: settings(), travelMinutes: {}, dayKeys });
    const [s, ...rest] = suggestPrepTimes({ pages, commitments, acks: {}, settings: settings(), now: at(DAY, 6) });
    expect(rest).toEqual([]);
    expect(s).toMatchObject({ title: "Dinner at Morgan's", currentPrepMinutes: 30, suggestedPrepMinutes: 40, lateCount: 2, sampled: 2, commitmentId: 'sample-history-dinner-7' });
    expect(s!.commitmentIds).toContain('sample-dinner');
  });
});

describe('the 666 haunting', () => {
  const commitments = [appt({ id: 'a', start: at(DAY, 10, 30) }), appt({ id: 'b', start: at(DAY, 14, 0), priority: 'low' })];
  const day = () => planDays({ commitments, places: PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY] }).days[0]!;

  it('stays away on a day with nothing missed, and while the day is still running', () => {
    const d = day();
    const acks = Object.fromEntries(d.pages.filter((p) => !p.silent).map((p) => [p.id, p.fireAt]));
    expect(haunting(d, acks, at(DAY, 23))).toBeNull();
    expect(haunting(d, {}, at(DAY, 6))).toBeNull();
  });

  it('comes back as one silent 666 listing what slipped, once the last page goes moot', () => {
    const d = day();
    const ready = d.pages.find((p) => p.kind === 'get-ready')!;
    const leave = d.pages.find((p) => p.kind === 'leave-now')!;
    const h = haunting(d, { [ready.id]: ready.fireAt }, at(DAY, 23))!;
    expect(h).toMatchObject({ id: `haunting:${DAY}`, code: '666', pageIds: [leave.id] });
    expect(h.text).toBe(`HAUNTING: 1 SLIPPED TODAY. ${leave.text}`);
    expect(h.at).toBe(Math.max(...d.pages.filter((p) => !p.silent).map((p) => p.cutoffAt)));
  });

  it('lists every missed page in fire order and is deterministic', () => {
    const d = day();
    const a = haunting(d, {}, at(DAY, 23))!;
    expect(a.text.startsWith('HAUNTING: 2 SLIPPED TODAY.')).toBe(true);
    expect(a.pageIds).toEqual(d.pages.filter((p) => !p.silent && p.countsToBudget).map((p) => p.id));
    expect(haunting(d, {}, at(DAY, 23))).toEqual(a);
  });
});
