import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { alertsUpTo, pageStatus } from '../../src/engine/alerts';
import { escalationStatus, isCancelled, lastBeepAt } from '../../src/engine/escalate';
import { ignoreReplay, pickIgnoreTarget, rebookPage } from '../../src/engine/haunt';
import { planDays, type PlanInput } from '../../src/engine/plan';
import { haunting } from '../../src/engine/report';
import { SAMPLE_ON_CALL } from '../../src/engine/sample';
import { addDays } from '../../src/engine/time';
import type { Commitment, DayPlan, Priority } from '../../src/engine/types';
import { at, M, PLACES, settings } from './helpers';

/**
 * Properties of on-call escalation (design.md, "Correctness properties"), checked
 * against generated days with escalation on. The generator leans towards must
 * appointments with a place, so escalation pages actually occur.
 */

const DAY = '2026-11-19';
const DAYS = [addDays(DAY, -1), DAY, addDays(DAY, 1)];
const PLACE_IDS = [...PLACES.map((p) => p.id), null];

const commitmentArb = (i: number) =>
  fc
    .record({
      kind: fc.constantFrom<'appointment' | 'focus'>('appointment', 'appointment', 'appointment', 'focus'),
      startMin: fc.integer({ min: 6 * 60, max: 22 * 60 }),
      lengthMin: fc.integer({ min: 15, max: 180 }),
      placeId: fc.constantFrom(...PLACE_IDS),
      prepMinutes: fc.constantFrom(0, 5, 10, 20, 30),
      priority: fc.constantFrom<Priority>('must', 'must', 'must', 'normal', 'low'),
      checkIn: fc.constantFrom<number | null>(null, 15, 30),
      allDay: fc.integer({ min: 0, max: 14 }).map((n) => n === 0),
    })
    .map(
      (r): Commitment => ({
        id: `c${i}`,
        title: 'Dentist',
        kind: r.kind,
        start: at(DAY, 0) + r.startMin * M,
        end: at(DAY, 0) + (r.startMin + r.lengthMin) * M,
        placeId: r.kind === 'focus' ? null : r.placeId,
        prepMinutes: r.prepMinutes,
        priority: r.priority,
        checkInEveryMinutes: r.kind === 'focus' ? r.checkIn : null,
        source: 'manual',
        allDay: r.kind === 'appointment' && r.allDay ? true : undefined,
      }),
    );

const dayArb = fc
  .integer({ min: 1, max: 10 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => commitmentArb(i))));

const settingsArb = fc.record({
  dailyBudget: fc.integer({ min: 1, max: 8 }),
  bufferMinutes: fc.constantFrom(0, 5, 10),
  honestyFactor: fc.constantFrom(1, 1.5),
  escalationMinutes: fc.constantFrom<number[]>([3, 6, 10], [2, 4], [5], []),
});

type Gen = { dailyBudget: number; bufferMinutes: number; honestyFactor: number; escalationMinutes: number[] };

const plan = (commitments: Commitment[], g: Gen, on = true, pinned: string[] = []) => {
  const input: PlanInput = {
    commitments,
    places: PLACES,
    settings: settings({ ...g, ...(on ? { onCall: SAMPLE_ON_CALL } : {}) }),
    travelMinutes: {},
    dayKeys: DAYS,
    pinnedPageIds: pinned,
  };
  return planDays(input);
};

const RUNS = { numRuns: 100 };
const SLOW = 60_000;

const escalationPages = (days: DayPlan[]) => days.flatMap((d) => d.pages.filter((p) => p.kind === 'escalation'));

describe('escalation properties', () => {
  it('the generator produces escalation pages often enough to mean something', () => {
    const days = fc.sample(fc.tuple(dayArb, settingsArb), { numRuns: 100, seed: 7 });
    const withEscalation = days.filter(([c, g]) => escalationPages(plan(c, g).days).length > 0).length;
    expect(withEscalation).toBeGreaterThan(20);
  }, SLOW);

  it('never makes a day exceed the budget, and budget.used equals the count (Req 5.1, 5.3, 5.8)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, g) => {
        for (const day of plan(commitments, g).days) {
          const beeping = day.pages.filter((p) => p.countsToBudget && !p.silent);
          expect(beeping.length).toBeLessThanOrEqual(g.dailyBudget);
          expect(day.budget.used).toBe(beeping.length);
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('an ACK at or before the instant cancels it, and an ACK after changes nothing (Req 6.1-6.3)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 40 }), (commitments, g, before, after) => {
        const p = plan(commitments, g);
        for (const esc of escalationPages(p.days)) {
          const leave = p.pages.find((x) => x.id === esc.dependsOn)!;
          const early = { [leave.id]: Math.max(leave.fireAt, esc.fireAt - before * M) };
          expect(isCancelled(esc, early)).toBe(true);
          expect(escalationStatus(esc, early, esc.cutoffAt)).toBe('cancelled');
          expect(alertsUpTo([esc], early, esc.cutoffAt + M)).toEqual([]);
          const late = { [leave.id]: esc.fireAt + after * M };
          expect(isCancelled(esc, late)).toBe(false);
          expect(alertsUpTo([esc], late, esc.cutoffAt + M)).toEqual(alertsUpTo([esc], {}, esc.cutoffAt + M));
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('is deterministic and independent of commitment order (Req 12.1, 12.2)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, g) => {
        const first = plan(commitments, g);
        expect(plan(commitments, g)).toEqual(first);
        expect(plan([...commitments].reverse(), g)).toEqual(first);
      }),
      RUNS,
    );
  }, SLOW);

  it('off means unchanged, and no page has kind escalation (Req 1.1, 1.7, 2.6)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, g) => {
        const without = plan(commitments, g, false);
        const disabled = planDays({
          commitments,
          places: PLACES,
          settings: settings({ ...g, onCall: { enabled: false, name: 'Sam' } }),
          travelMinutes: {},
          dayKeys: DAYS,
        });
        expect(disabled).toEqual(without);
        expect(without.pages.some((p) => p.kind === 'escalation')).toBe(false);
      }),
      RUNS,
    );
  }, SLOW);

  it('only a must leave-now page escalates, once a day, one minute after its last beep, before the cutoff (Req 2.1-2.5, 3.1, 3.4, 3.5)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, g) => {
        const p = plan(commitments, g);
        const byId = new Map(commitments.map((c) => [c.id, c]));
        for (const day of p.days) {
          const list = day.pages.filter((x) => x.kind === 'escalation');
          expect(list.length).toBeLessThanOrEqual(1);
          if (g.dailyBudget < 2) expect(list).toEqual([]);
        }
        for (const esc of escalationPages(p.days)) {
          const leave = p.pages.find((x) => x.id === esc.dependsOn);
          expect(leave?.kind).toBe('leave-now');
          expect(byId.get(leave!.commitmentId!)?.priority).toBe('must');
          expect(esc.fireAt).toBe(lastBeepAt(leave!) + M);
          expect(esc.fireAt).toBeLessThan(esc.cutoffAt);
          expect(esc.cutoffAt).toBe(leave!.cutoffAt);
          expect(esc.escalateAt).toEqual([]);
          expect(alertsUpTo([esc], {}, esc.cutoffAt + 600 * M)).toHaveLength(1);
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('never lets an escalation page reach the recap, the rebook page or the replay target, and the two ACKs are independent (Req 6.4-6.6, 7.4, 7.6, 8.1)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, fc.integer({ min: 0, max: 2 }), (commitments, g, answer) => {
        const p = plan(commitments, g);
        for (const day of p.days) {
          const withoutEsc: DayPlan = { ...day, pages: day.pages.filter((x) => x.kind !== 'escalation') };
          const target = pickIgnoreTarget(day, commitments);
          expect(target?.kind).not.toBe('escalation');
          expect(target).toEqual(pickIgnoreTarget(withoutEsc, commitments));
          const loud = day.pages.filter((x) => !x.silent);
          if (loud.length === 0) continue;
          const over = Math.max(...loud.map((x) => x.cutoffAt));
          // Answer nothing, answer every other page's first beep, or answer only the escalation pages.
          const acks: Record<string, number> = {};
          if (answer === 1) for (const x of day.pages) if (x.kind !== 'escalation') acks[x.id] = x.fireAt;
          if (answer === 2) for (const x of day.pages) if (x.kind === 'escalation') acks[x.id] = x.fireAt;
          const recap = haunting(day, acks, over);
          expect(recap).toEqual(haunting(withoutEsc, acks, over));
          expect(recap?.pageIds.some((id) => id.endsWith(':escalate')) ?? false).toBe(false);
          const state = { acks, delivered: alertsUpTo(day.pages, acks, over).map((a) => a.id) };
          expect(rebookPage(day, state, commitments, 'America/Chicago', over + 24 * 60 * M)).toEqual(
            rebookPage(withoutEsc, state, commitments, 'America/Chicago', over + 24 * 60 * M),
          );
          if (target) expect(ignoreReplay(day, target.id)).not.toBeNull();
          // Independent ACKs: the secondary's ACK never answers the 911, and the 911's ACK never answers the secondary page.
          for (const esc of day.pages.filter((x) => x.kind === 'escalation')) {
            const leave = day.pages.find((x) => x.id === esc.dependsOn)!;
            expect(pageStatus(leave, { [esc.id]: esc.fireAt }, esc.fireAt)).not.toBe('acked');
            expect(escalationStatus(esc, { [leave.id]: esc.fireAt + M }, esc.fireAt + M)).not.toBe('acked');
          }
        }
      }),
      RUNS,
    );
  }, SLOW);
});
