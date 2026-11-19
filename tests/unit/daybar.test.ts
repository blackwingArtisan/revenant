import { describe, expect, it } from 'vitest';
import { dayBarFraction } from '../../src/app/dayBar';
import { zonedToEpoch } from '../../src/engine/time';

const TZ = 'America/Chicago';
const at = (day: string, hour: number, minute = 0) => {
  const [year, month, d] = day.split('-').map(Number);
  return zonedToEpoch({ year: year!, month: month!, day: d!, hour, minute }, TZ);
};

describe('day bar', () => {
  it('runs from 6 AM (0) to midnight (1)', () => {
    expect(dayBarFraction(at('2026-11-19', 6), '2026-11-19', TZ)).toBe(0);
    expect(dayBarFraction(at('2026-11-19', 15), '2026-11-19', TZ)).toBe(0.5);
    expect(dayBarFraction(at('2026-11-20', 0), '2026-11-19', TZ)).toBe(1);
  });

  it('leaves out the small hours and other days', () => {
    expect(dayBarFraction(at('2026-11-19', 5, 59), '2026-11-19', TZ)).toBeNull();
    expect(dayBarFraction(at('2026-11-20', 9), '2026-11-19', TZ)).toBeNull();
  });

  it('stays correct on a 25-hour fall-back day, where the extra hour is before 6 AM', () => {
    // 2026-11-01: clocks go back at 2 AM, so 6 AM to midnight is still 18 hours.
    expect(dayBarFraction(at('2026-11-01', 15), '2026-11-01', TZ)).toBe(0.5);
  });
});
