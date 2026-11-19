import { addDays, parseDayKey, startOfDay, zonedToEpoch } from '../engine/time';

/** The waking day the bar shows: 6 AM to midnight, local time. */
export const DAY_BAR_FROM_HOUR = 6;

/** Where an instant sits on the 6 AM-midnight bar of a local day, from 0 to 1; null when it is off the bar. DST-correct. */
export function dayBarFraction(at: number, dayKey: string, timeZone: string): number | null {
  const from = zonedToEpoch({ ...parseDayKey(dayKey), hour: DAY_BAR_FROM_HOUR, minute: 0 }, timeZone);
  const to = startOfDay(addDays(dayKey, 1), timeZone);
  if (at < from || at > to) return null;
  return (at - from) / (to - from);
}
