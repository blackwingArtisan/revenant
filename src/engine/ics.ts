/**
 * A small, dependency-free iCalendar (RFC 5545) reader for the parts a pager
 * needs: VEVENT start/end, summary, location, GEO, all-day events, cancelled
 * events, and the common recurrence rules (DAILY / WEEKLY / MONTHLY with
 * INTERVAL, COUNT, UNTIL, BYDAY, EXDATE and RECURRENCE-ID overrides).
 *
 * Recurrence is expanded in local wall time, so a 9:00 AM weekly meeting
 * stays at 9:00 AM across a daylight-saving change.
 */
import { addDays, DAY, isValidTimeZone, localParts, MINUTE, parseDayKey, pad, zonedToEpoch, type WallTime } from './time';
import type { GeoPoint } from './types';

export interface IcsEvent {
  /** Unique per occurrence: the UID, plus the start instant for recurring events. */
  uid: string;
  summary: string;
  location: string;
  start: number;
  end: number;
  allDay: boolean;
  geo: GeoPoint | null;
}

export interface IcsParseOptions {
  /** Zone for floating times and unknown TZIDs. */
  defaultTimeZone: string;
  /** Only occurrences that end after this instant are returned. */
  windowStart: number;
  /** Only occurrences that start before this instant are returned. */
  windowEnd: number;
}

export interface IcsParseResult {
  events: IcsEvent[];
  warnings: string[];
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface DateValue {
  wall: WallTime;
  allDay: boolean;
  utc: boolean;
  timeZone: string;
}

interface RawEvent {
  props: Prop[];
}

/** Windows zone names some calendar exports use in TZID. */
const WINDOWS_ZONES: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Kolkata',
  UTC: 'UTC',
};

const MAX_OCCURRENCES = 5000;
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function unfold(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      out.push(line);
    }
  }
  return out;
}

export function parseLine(line: string): Prop | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.match(/(?:[^;"]+|"[^"]*")+/g) ?? [];
  const name = (parts.shift() ?? '').toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

function resolveZone(tzid: string | undefined, fallback: string, warnings: string[]): string {
  if (!tzid) return fallback;
  const cleaned = tzid.replace(/^\/+/, '');
  if (WINDOWS_ZONES[cleaned]) return WINDOWS_ZONES[cleaned];
  if (isValidTimeZone(cleaned)) return cleaned;
  warnings.push(`Unknown time zone "${tzid}"; using ${fallback}.`);
  return fallback;
}

export function parseDateValue(prop: Prop, fallbackZone: string, warnings: string[]): DateValue | null {
  const v = prop.value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || prop.params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return {
      wall: { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 0, minute: 0, second: 0 },
      allDay: true,
      utc: false,
      timeZone: fallbackZone,
    };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const utc = m[7] === 'Z';
  return {
    wall: {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] ?? 0),
    },
    allDay: false,
    utc,
    timeZone: utc ? 'UTC' : resolveZone(prop.params.TZID, fallbackZone, warnings),
  };
}

function toEpoch(d: DateValue): number {
  return zonedToEpoch(d.wall, d.timeZone);
}

/** ISO 8601 duration ("PT45M", "P1DT2H", "-PT15M") to ms. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const [w, d, h, min, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0)) as [number, number, number, number, number];
  return sign * ((w * 7 + d) * DAY + h * 60 * MINUTE + min * MINUTE + s * 1000);
}

function parseGeo(value: string): GeoPoint | null {
  const [lat, lon] = value.split(/[;,]/).map(Number);
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  count: number | null;
  until: number | null;
  byDay: number[];
}

export function parseRrule(value: string, fallbackZone: string, warnings: string[]): Rule | null {
  const parts = Object.fromEntries(
    value.split(';').map((kv) => {
      const [k, v] = kv.split('=');
      return [(k ?? '').toUpperCase(), v ?? ''];
    }),
  );
  const freq = parts.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') {
    warnings.push(`Repeat rule FREQ=${freq ?? '?'} is not supported; only the first occurrence was imported.`);
    return null;
  }
  let until: number | null = null;
  if (parts.UNTIL) {
    const d = parseDateValue({ name: 'UNTIL', params: {}, value: parts.UNTIL }, fallbackZone, warnings);
    if (d) until = d.allDay ? zonedToEpoch({ ...d.wall, hour: 23, minute: 59, second: 59 }, fallbackZone) : toEpoch(d);
  }
  const byDay = (parts.BYDAY ?? '')
    .split(',')
    .map((code) => WEEKDAY_CODES.indexOf(code.replace(/^[+-]?\d+/, '').toUpperCase()))
    .filter((n) => n >= 0);
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until,
    byDay,
  };
}

function dayKeyOf(w: WallTime): string {
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

function weekdayOf(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Occurrence start wall times, in order, for a rule anchored at `start`. */
function* occurrenceDays(start: DateValue, rule: Rule): Generator<string> {
  const first = dayKeyOf(start.wall);
  if (rule.freq === 'DAILY') {
    for (let i = 0; ; i += rule.interval) yield addDays(first, i);
  }
  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay.length > 0 ? [...rule.byDay].sort() : [weekdayOf(first)];
    const weekStart = addDays(first, -weekdayOf(first));
    for (let w = 0; ; w += rule.interval) {
      for (const wd of days) {
        const key = addDays(weekStart, w * 7 + wd);
        if (key >= first) yield key;
      }
    }
  }
  // MONTHLY on the same day of month; months without that day are skipped (RFC 5545).
  const { year, month, day } = parseDayKey(first);
  for (let i = 0; ; i += rule.interval) {
    const y = year + Math.floor((month - 1 + i) / 12);
    const m = ((month - 1 + i) % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (day <= last) yield `${y}-${pad(m)}-${pad(day)}`;
  }
}

function prop(ev: RawEvent, name: string): Prop | undefined {
  return ev.props.find((p) => p.name === name);
}

export function parseIcs(text: string, options: IcsParseOptions): IcsParseResult {
  const warnings: string[] = [];
  const raw: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      if (p.value.toUpperCase() === 'VEVENT' && !current) {
        current = { props: [] };
        depth = 0;
      } else if (current) depth++;
      continue;
    }
    if (p.name === 'END') {
      if (current && depth === 0 && p.value.toUpperCase() === 'VEVENT') {
        raw.push(current);
        current = null;
      } else if (current) depth--;
      continue;
    }
    if (current && depth === 0) current.props.push(p);
  }
  if (raw.length === 0 && !/BEGIN:VCALENDAR/i.test(text)) warnings.push('This does not look like an .ics calendar file.');

  const overrides = new Map<string, RawEvent>();
  for (const ev of raw) {
    const rid = prop(ev, 'RECURRENCE-ID');
    const uid = prop(ev, 'UID')?.value ?? '';
    if (rid) {
      const d = parseDateValue(rid, options.defaultTimeZone, warnings);
      if (d) overrides.set(`${uid}|${toEpoch(d)}`, ev);
    }
  }

  const events: IcsEvent[] = [];
  const inWindow = (start: number, end: number) => end > options.windowStart && start < options.windowEnd;

  const build = (ev: RawEvent, uid: string, start: number, end: number, allDay: boolean): IcsEvent => ({
    uid,
    summary: unescapeText(prop(ev, 'SUMMARY')?.value ?? '').trim() || 'Untitled',
    location: unescapeText(prop(ev, 'LOCATION')?.value ?? '').trim(),
    start,
    end,
    allDay,
    geo: prop(ev, 'GEO') ? parseGeo(prop(ev, 'GEO')!.value) : null,
  });

  for (const ev of raw) {
    if ((prop(ev, 'STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') continue;
    const dtstartProp = prop(ev, 'DTSTART');
    const uid = prop(ev, 'UID')?.value ?? `event-${events.length + 1}`;
    if (!dtstartProp) {
      warnings.push(`"${prop(ev, 'SUMMARY')?.value ?? uid}" has no start time and was skipped.`);
      continue;
    }
    const start = parseDateValue(dtstartProp, options.defaultTimeZone, warnings);
    if (!start) {
      warnings.push(`"${prop(ev, 'SUMMARY')?.value ?? uid}" has an unreadable start time and was skipped.`);
      continue;
    }
    const startMs = toEpoch(start);
    let durationMs: number;
    const dtend = prop(ev, 'DTEND');
    const duration = prop(ev, 'DURATION');
    const endValue = dtend ? parseDateValue(dtend, start.timeZone, warnings) : null;
    if (endValue) durationMs = toEpoch(endValue) - startMs;
    else if (duration && parseDuration(duration.value) !== null) durationMs = parseDuration(duration.value)!;
    else durationMs = start.allDay ? DAY : 0;
    durationMs = Math.max(0, durationMs);

    if (prop(ev, 'RECURRENCE-ID')) {
      if (inWindow(startMs, startMs + durationMs)) events.push(build(ev, `${uid}@${startMs}`, startMs, startMs + durationMs, start.allDay));
      continue;
    }

    const rruleProp = prop(ev, 'RRULE');
    const rule = rruleProp ? parseRrule(rruleProp.value, start.timeZone, warnings) : null;
    if (!rule) {
      if (inWindow(startMs, startMs + durationMs)) events.push(build(ev, uid, startMs, startMs + durationMs, start.allDay));
      continue;
    }

    const exdates = new Set<number>();
    for (const p of ev.props.filter((x) => x.name === 'EXDATE')) {
      for (const v of p.value.split(',')) {
        const d = parseDateValue({ ...p, value: v }, start.timeZone, warnings);
        if (d) exdates.add(toEpoch(d.allDay ? { ...d, wall: { ...d.wall, hour: start.wall.hour, minute: start.wall.minute } } : d));
      }
    }

    let emitted = 0;
    let n = 0;
    for (const day of occurrenceDays(start, rule)) {
      if (++n > MAX_OCCURRENCES) {
        warnings.push(`"${prop(ev, 'SUMMARY')?.value ?? uid}" repeats more than ${MAX_OCCURRENCES} times; the rest were skipped.`);
        break;
      }
      const occ = zonedToEpoch({ ...parseDayKey(day), hour: start.wall.hour, minute: start.wall.minute, second: start.wall.second ?? 0 }, start.timeZone);
      if (rule.until !== null && occ > rule.until) break;
      if (rule.count !== null && emitted >= rule.count) break;
      if (occ > options.windowEnd) break;
      emitted++;
      if (exdates.has(occ) || overrides.has(`${uid}|${occ}`)) continue;
      if (inWindow(occ, occ + durationMs)) events.push(build(ev, `${uid}@${occ}`, occ, occ + durationMs, start.allDay));
    }
  }

  events.sort((a, b) => a.start - b.start || a.uid.localeCompare(b.uid));
  return { events, warnings };
}

/** Wall time label used when reporting imports. */
export function describeStart(ev: IcsEvent, timeZone: string): string {
  const p = localParts(ev.start, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}
