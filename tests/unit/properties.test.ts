import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { alertsForPage } from '../../src/engine/alerts';
import { suggestPrepTimes } from '../../src/engine/learn';
import { planDays, type PlanInput } from '../../src/engine/plan';
import { addDays } from '../../src/engine/time';
import type { Commitment, Priority } from '../../src/engine/types';
import { at, M, PLACES, settings } from './helpers';

/**
 * Correctness properties from the spec's design.md, checked against generated
 * days rather than hand-picked examples. Each property names its criteria.
 */

const DAY = '2026-11-19';
const DAYS = [addDays(DAY, -1), DAY, addDays(DAY, 1)];
const PLACE_IDS = [...PLACES.map((p) => p.id), null];

/** One commitment somewhere between 6 AM and 10 PM on the demo day. */
const commitmentArb = (i: number) =>
  fc
    .record({
      kind: fc.constantFrom<'appointment' | 'focus'>('appointment', 'appointment', 'focus'),
      startMin: fc.integer({ min: 6 * 60, max: 22 * 60 }),
      lengthMin: fc.integer({ min: 15, max: 180 }),
      placeId: fc.constantFrom(...PLACE_IDS),
      prepMinutes: fc.constantFrom(0, 5, 10, 20, 30, 45),
      priority: fc.constantFrom<Priority>('must', 'normal', 'normal', 'low'),
      checkIn: fc.constantFrom<number | null>(null, null, 15, 30),
      allDay: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
      title: fc.constantFrom('Dentist', 'Gym', 'Dinner', 'Standup'),
    })
    .map(
      (r): Commitment => ({
        id: `c${i}`,
        title: r.title,
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
  .integer({ min: 0, max: 12 })
  .chain((n) => (n === 0 ? fc.constant([] as Commitment[]) : fc.tuple(...Array.from({ length: n }, (_, i) => commitmentArb(i)))));

const settingsArb = fc.record({
  dailyBudget: fc.integer({ min: 1, max: 8 }),
  bufferMinutes: fc.constantFrom(0, 5, 10),
  honestyFactor: fc.constantFrom(1, 1.25, 1.5),
});

const input = (commitments: Commitment[], s: Partial<ReturnType<typeof settings>> = {}): PlanInput => ({
  commitments,
  places: PLACES,
  settings: settings(s),
  travelMinutes: {},
  dayKeys: DAYS,
});

const RUNS = { numRuns: 100 };
/** Generous, so a loaded CI machine does not fail a property on time alone. */
const SLOW = 60_000;

describe('correctness properties', () => {
  it('never lets more pages beep in a day than the silence budget allows (Req 3.1, 3.4)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, s) => {
        for (const day of planDays(input(commitments, s)).days) {
          const beeping = day.pages.filter((p) => p.countsToBudget && !p.silent);
          expect(beeping.length).toBeLessThanOrEqual(s.dailyBudget);
          expect(day.budget.used).toBeLessThanOrEqual(day.budget.limit);
          const low = new Set(commitments.filter((c) => c.priority === 'low' || c.allDay).map((c) => c.id));
          expect(day.pages.filter((p) => !p.silent && p.commitmentId !== null && low.has(p.commitmentId))).toEqual([]);
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('stops every repeat once a page is acknowledged (Req 2.1, 2.2)', () => {
    fc.assert(
      fc.property(dayArb, fc.integer({ min: 0, max: 90 }), (commitments, ackAfterMin) => {
        for (const p of planDays(input(commitments)).pages) {
          const ackAt = p.fireAt + ackAfterMin * M;
          for (const a of alertsForPage(p, ackAt, Number.MAX_SAFE_INTEGER)) expect(a.at).toBeLessThanOrEqual(ackAt);
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('plans the same pages in the same order for the same input, whatever order the commitments come in (Req 1.10)', () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, s) => {
        const a = planDays(input(commitments, s));
        const b = planDays(input([...commitments].reverse(), s));
        expect(b).toEqual(a);
      }),
      RUNS,
    );
  }, SLOW);

  it("never pages an appointment at or after its start time (Req 1.1, 1.9)", () => {
    fc.assert(
      fc.property(dayArb, settingsArb, (commitments, s) => {
        const byId = new Map(commitments.map((c) => [c.id, c]));
        for (const p of planDays(input(commitments, s)).pages) {
          const c = p.commitmentId ? byId.get(p.commitmentId) : undefined;
          if (c?.kind === 'appointment' && !p.silent) expect(p.fireAt).toBeLessThan(c.start);
        }
      }),
      RUNS,
    );
  }, SLOW);

  it('never adds a page when a prep-time suggestion is applied (Req 9.6)', () => {
    fc.assert(
      fc.property(dayArb, fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 12, maxLength: 12 }), (commitments, lateness) => {
        const before = planDays(input(commitments));
        const leaves = before.pages.filter((p) => p.kind === 'leave-now');
        const acks = Object.fromEntries(leaves.map((p, i) => [p.id, p.fireAt + lateness[i % lateness.length]! * M]));
        const suggestions = suggestPrepTimes({ pages: before.pages, commitments, acks, settings: settings(), now: at(addDays(DAY, 2), 0) });
        const applied = commitments.map((c) => {
          const s = suggestions.find((x) => x.commitmentIds.includes(c.id));
          return s ? { ...c, prepMinutes: s.suggestedPrepMinutes } : c;
        });
        const after = planDays(input(applied));
        expect(after.pages.length).toBeLessThanOrEqual(before.pages.length);
        // A longer prep time can move a get-ready page up the budget ranking (earlier pages rank first),
        // so it may take the slot of another page. It never creates a page for a commitment without prep.
        const ids = new Set(before.pages.map((p) => p.id));
        const hadPrep = new Set(commitments.filter((c) => c.prepMinutes > 0).map((c) => c.id));
        for (const p of after.pages) {
          if (ids.has(p.id)) continue;
          expect(p.kind, p.id).toBe('get-ready');
          expect(hadPrep.has(p.commitmentId ?? ''), p.id).toBe(true);
        }
      }),
      RUNS,
    );
  }, SLOW);
});
