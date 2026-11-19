import { describe, expect, it } from 'vitest';
import { alertsUpTo } from '../../src/engine/alerts';
import { ignoreReplay, pickIgnoreTarget, rebookPage, resurrection } from '../../src/engine/haunt';
import { planDays } from '../../src/engine/plan';
import { haunting } from '../../src/engine/report';
import { tick } from '../../src/engine/runtime';
import { sampleDay, SAMPLE_PLACES } from '../../src/engine/sample';
import { addDays, readableClock } from '../../src/engine/time';
import { at, settings, TZ } from './helpers';

const DAY = '2026-11-19';
const NEXT = addDays(DAY, 1);
const commitments = sampleDay(DAY, TZ);
const plan = planDays({ commitments, places: SAMPLE_PLACES, settings: settings(), travelMinutes: {}, dayKeys: [DAY, NEXT] });
const day = plan.days[0]!;

describe('ignore it: the replayed day', () => {
  it('lets the first must-go leave-now page slip: the dentist', () => {
    const target = pickIgnoreTarget(day, commitments)!;
    expect(target.kind).toBe('leave-now');
    expect(target.text).toMatch(/^LEAVE NOW: DENTIST CLEANING/);
  });

  it('answers every other page on its first beep and leaves only the target missed', () => {
    const target = pickIgnoreTarget(day, commitments)!;
    const replay = ignoreReplay(day, target.id)!;
    expect(replay.state.acks[target.id]).toBeUndefined();
    for (const p of day.pages) if (p.id !== target.id) expect(replay.state.acks[p.id]).toBe(p.fireAt);
    const h = haunting(day, replay.state.acks, replay.dayOverAt)!;
    expect(h.pageIds).toEqual([target.id]);
    expect(h.at).toBe(replay.dayOverAt);
  });

  it('jumping to the end of the replayed day beeps nothing', () => {
    const target = pickIgnoreTarget(day, commitments)!;
    const replay = ignoreReplay(day, target.id)!;
    expect(tick(plan.pages.filter((p) => p.dayKey === DAY), replay.state, replay.dayOverAt).fresh).toEqual([]);
  });

  it('returns null for a page that is not on the day', () => {
    expect(ignoreReplay(day, 'nope')).toBeNull();
  });
});

describe('the next morning', () => {
  const target = pickIgnoreTarget(day, commitments)!;
  const { state } = ignoreReplay(day, target.id)!;

  it('shows a 666 rebook page from 7 AM, naming what slipped', () => {
    expect(rebookPage(day, state, commitments, TZ, at(NEXT, 6, 59))).toBeNull();
    const r = rebookPage(day, state, commitments, TZ, at(NEXT, 7))!;
    expect(r.code).toBe('666');
    expect(r.text).toBe('666 YESTERDAY: DENTIST CLEANING. REBOOK?');
    expect(r.id).toBe(`rebook:${DAY}`);
    expect(readableClock(r.at, TZ)).toBe('7:00 AM');
    expect(r.commitmentIds).toEqual([target.commitmentId]);
  });

  it('counts each missed commitment once, in fire order', () => {
    const end = Math.max(...day.pages.map((p) => p.cutoffAt));
    const ignored = { acks: {}, delivered: alertsUpTo(day.pages, {}, end).map((a) => a.id) };
    const r = rebookPage(day, ignored, commitments, TZ, at(NEXT, 8))!;
    expect(new Set(r.commitmentIds).size).toBe(r.commitmentIds.length);
    expect(r.text).toMatch(/^666 YESTERDAY: .+ \+\d+ MORE\. REBOOK\?$/);
  });

  it('stays quiet about a day the pager never beeped through', () => {
    expect(rebookPage(day, { acks: {}, delivered: [] }, commitments, TZ, at(NEXT, 8))).toBeNull();
  });

  it('has nothing to say after a day with nothing missed', () => {
    const all = Object.fromEntries(day.pages.map((p) => [p.id, p.fireAt]));
    expect(rebookPage(day, { acks: all, delivered: state.delivered }, commitments, TZ, at(NEXT, 8))).toBeNull();
  });
});

describe('resurrect', () => {
  const dentist = commitments.find((c) => c.title === 'Dentist cleaning')!;

  it('books a 15-minute call-to-rebook block at 9 AM', () => {
    const c = resurrection(dentist, NEXT, TZ, at(NEXT, 7), 'r1');
    expect(c).toMatchObject({ id: 'r1', title: 'Call to rebook: Dentist cleaning', kind: 'focus', priority: 'normal', placeId: null });
    expect(readableClock(c.start, TZ)).toBe('9:00 AM');
    expect(c.end - c.start).toBe(15 * 60_000);
  });

  it('after 9 AM, books it 15 minutes from now on a 5-minute mark', () => {
    const c = resurrection(dentist, NEXT, TZ, at(NEXT, 10, 2), 'r2');
    expect(readableClock(c.start, TZ)).toBe('10:20 AM');
  });

  it('pages 121 to start it', () => {
    const c = resurrection(dentist, NEXT, TZ, at(NEXT, 7), 'r3');
    const pages = planDays({ commitments: [c], places: SAMPLE_PLACES, settings: settings(), travelMinutes: {}, dayKeys: [NEXT] }).pages;
    expect(pages[0]).toMatchObject({ code: '121', kind: 'focus-start' });
  });
});
