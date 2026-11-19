import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayLengthMs,
  HOUR,
  lcdClock,
  localDayKey,
  localParts,
  parseHm,
  readableClock,
  startOfDay,
  tzOffsetMs,
  zonedToEpoch,
} from '../../src/engine/time';

const TZ = 'America/Chicago';

describe('zoned time', () => {
  it('converts Chicago wall time to UTC in winter and summer', () => {
    expect(new Date(zonedToEpoch({ year: 2026, month: 11, day: 19, hour: 10, minute: 0 }, TZ)).toISOString()).toBe(
      '2026-11-19T16:00:00.000Z',
    );
    expect(new Date(zonedToEpoch({ year: 2026, month: 7, day: 4, hour: 10, minute: 0 }, TZ)).toISOString()).toBe(
      '2026-07-04T15:00:00.000Z',
    );
  });

  it('moves a skipped spring-forward time later by the gap', () => {
    const t = zonedToEpoch({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, TZ);
    expect(new Date(t).toISOString()).toBe('2026-03-08T08:30:00.000Z');
    expect(localParts(t, TZ).hour).toBe(3);
  });

  it('resolves an ambiguous fall-back time to the earlier instant', () => {
    const t = zonedToEpoch({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, TZ);
    expect(new Date(t).toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });

  it('reports 23-hour and 25-hour days around daylight saving', () => {
    expect(dayLengthMs('2026-03-08', TZ)).toBe(23 * HOUR);
    expect(dayLengthMs('2026-11-01', TZ)).toBe(25 * HOUR);
    expect(dayLengthMs('2026-11-19', TZ)).toBe(24 * HOUR);
  });

  it('finds the local day and its start in the zone, not in UTC', () => {
    const lateEvening = Date.parse('2026-11-20T04:30:00Z'); // 10:30 PM on the 19th in Chicago
    expect(localDayKey(lateEvening, TZ)).toBe('2026-11-19');
    expect(localDayKey(lateEvening, 'UTC')).toBe('2026-11-20');
    expect(new Date(startOfDay('2026-11-19', TZ)).toISOString()).toBe('2026-11-19T06:00:00.000Z');
  });

  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes zone offsets', () => {
    expect(tzOffsetMs(Date.parse('2026-01-15T12:00:00Z'), TZ)).toBe(-6 * HOUR);
    expect(tzOffsetMs(Date.parse('2026-07-15T12:00:00Z'), TZ)).toBe(-5 * HOUR);
    expect(tzOffsetMs(Date.parse('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * HOUR);
  });

  it('formats LCD and readable clocks', () => {
    const t = zonedToEpoch({ year: 2026, month: 11, day: 19, hour: 0, minute: 5 }, TZ);
    expect(lcdClock(t, TZ)).toBe('12:05A');
    expect(readableClock(t + 13 * HOUR, TZ)).toBe('1:05 PM');
  });

  it('parses HH:MM', () => {
    expect(parseHm('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('nope')).toBeNull();
  });
});
