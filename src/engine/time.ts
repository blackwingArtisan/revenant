/**
 * Time-zone arithmetic without a date library.
 *
 * Every instant in the engine is epoch milliseconds. Wall-clock values only
 * appear at the edges (day boundaries, digest time, calendar import), and they
 * are converted with the IANA zone database built into `Intl`.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface WallTime {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

export interface LocalParts extends Required<WallTime> {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function localParts(epochMs: number, timeZone: string): LocalParts {
  const out: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(epochMs))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday ?? 'Sun'] ?? 0,
  };
}

/** Offset of the zone from UTC at an instant, in ms (Chicago in winter = -6h). */
export function tzOffsetMs(epochMs: number, timeZone: string): number {
  const p = localParts(epochMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(epochMs / 1000) * 1000;
  return asUtc - truncated;
}

function sameWall(epochMs: number, w: WallTime, timeZone: string): boolean {
  const p = localParts(epochMs, timeZone);
  return (
    p.year === w.year &&
    p.month === w.month &&
    p.day === w.day &&
    p.hour === w.hour &&
    p.minute === w.minute &&
    p.second === (w.second ?? 0)
  );
}

/**
 * Wall-clock time in a zone to an instant, with the same "compatible" rule as
 * Temporal: an ambiguous time (fall back) resolves to the earlier instant, and
 * a skipped time (spring forward) moves forward by the length of the gap.
 */
export function zonedToEpoch(w: WallTime, timeZone: string): number {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0);
  const before = tzOffsetMs(guess - 12 * HOUR, timeZone);
  const after = tzOffsetMs(guess + 12 * HOUR, timeZone);
  const candidates = [guess - before, guess - after].filter((t) => sameWall(t, w, timeZone));
  if (candidates.length > 0) return Math.min(...candidates);
  return guess - before;
}

/** "YYYY-MM-DD" of the local calendar day an instant falls on. */
export function localDayKey(epochMs: number, timeZone: string): string {
  const p = localParts(epochMs, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [y, m, d] = dayKey.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

export function addDays(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKey(dayKey);
  const t = new Date(Date.UTC(year, month - 1, day + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function startOfDay(dayKey: string, timeZone: string): number {
  return zonedToEpoch({ ...parseDayKey(dayKey), hour: 0, minute: 0 }, timeZone);
}

/** Length of a local day in ms: 23h on spring-forward days, 25h on fall-back days. */
export function dayLengthMs(dayKey: string, timeZone: string): number {
  return startOfDay(addDays(dayKey, 1), timeZone) - startOfDay(dayKey, timeZone);
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "7:05P" style clock used on the LCD. */
export function lcdClock(epochMs: number, timeZone: string): string {
  const p = localParts(epochMs, timeZone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)}${p.hour < 12 ? 'A' : 'P'}`;
}

/** "7:05 PM" for screen readers and the day sheet. */
export function readableClock(epochMs: number, timeZone: string): string {
  const p = localParts(epochMs, timeZone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** Parse "HH:MM" (24h). */
export function parseHm(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
