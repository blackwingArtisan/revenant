import { describe, expect, it } from 'vitest';
import { beforeAfter, mayaMorning } from '../../src/engine/compare';
import { planDays } from '../../src/engine/plan';
import { readableClock } from '../../src/engine/time';
import { appt, at, PLACES, settings, TZ } from './helpers';

const DAY = '2026-11-19';
const clock = (t: number) => readableClock(t, TZ);

describe('before and after', () => {
  it("computes Maya's illustrative morning, the numbers quoted in the README and the app", () => {
    const m = mayaMorning(DAY, settings());
    expect([clock(m.phoneAlertAt), clock(m.phoneLeaveAt), clock(m.phoneArriveAt), m.phoneLateMinutes]).toEqual(['10:15 AM', '10:45 AM', '11:07 AM', 37]);
    expect([clock(m.readyAt), clock(m.leaveAt), clock(m.arriveAt), m.earlyMinutes]).toEqual(['9:33 AM', '10:03 AM', '10:25 AM', 5]);
  });

  it("gives the same get-ready and leave-now times as the planner", () => {
    const c = appt({ id: 'd', start: at(DAY, 10, 30), prepMinutes: 20 });
    const pages = planDays({ commitments: [c], places: PLACES, settings: settings(), travelMinutes: { d: 22 }, dayKeys: [DAY] }).pages;
    const m = beforeAfter({ start: c.start, travelMinutes: 22, prepMinutes: 20, phoneLeadMinutes: 15, settings: settings() });
    expect(pages.find((p) => p.kind === 'get-ready')!.fireAt).toBe(m.readyAt);
    expect(pages.find((p) => p.kind === 'leave-now')!.fireAt).toBe(m.leaveAt);
  });

  it('never reports negative lateness', () => {
    const m = beforeAfter({ start: at(DAY, 10, 30), travelMinutes: 5, prepMinutes: 0, phoneLeadMinutes: 60, settings: settings() });
    expect(m.phoneLateMinutes).toBe(0);
  });
});
