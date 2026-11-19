import { describe, expect, it } from 'vitest';
import { parseDuration, parseIcs, parseLine, unescapeText, unfold } from '../../src/engine/ics';
import { icsToCommitments, matchPlace, mergeCommitments } from '../../src/engine/importer';
import { lcdClock } from '../../src/engine/time';
import { at, PLACES, TZ } from './helpers';

const WINDOW = { defaultTimeZone: TZ, windowStart: Date.parse('2026-01-01T00:00:00Z'), windowEnd: Date.parse('2027-01-01T00:00:00Z') };

function cal(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Example Corp//Calendar//EN', ...events, 'END:VCALENDAR'].join('\r\n');
}

function vevent(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

describe('content lines', () => {
  it('unfolds continuation lines', () => {
    expect(unfold('SUMMARY:Long \r\n  title\r\nUID:1')).toEqual(['SUMMARY:Long  title', 'UID:1']);
  });

  it('splits name, params and value, respecting quotes', () => {
    expect(parseLine('DTSTART;TZID="America/Chicago":20261119T100000')).toEqual({
      name: 'DTSTART',
      params: { TZID: 'America/Chicago' },
      value: '20261119T100000',
    });
    expect(parseLine('LOCATION;ALTREP="http://example.com/a:b":Room 1')?.value).toBe('Room 1');
  });

  it('unescapes text values', () => {
    expect(unescapeText('Lantern St\\, Suite 4\\nBring card\\; arrive early\\\\')).toBe('Lantern St, Suite 4\nBring card; arrive early\\');
  });

  it('parses durations', () => {
    expect(parseDuration('PT45M')).toBe(45 * 60_000);
    expect(parseDuration('P1DT2H')).toBe(26 * 3_600_000);
    expect(parseDuration('-PT15M')).toBe(-15 * 60_000);
    expect(parseDuration('soon')).toBeNull();
  });
});

describe('parseIcs', () => {
  it('reads UTC, TZID and floating times', () => {
    const text = cal(
      vevent(['UID:a', 'SUMMARY:UTC call', 'DTSTART:20261119T160000Z', 'DTEND:20261119T163000Z']),
      vevent(['UID:b', 'SUMMARY:Dentist', 'DTSTART;TZID=America/New_York:20261119T120000', 'DURATION:PT1H']),
      vevent(['UID:c', 'SUMMARY:Floating', 'DTSTART:20261119T150000']),
    );
    const { events, warnings } = parseIcs(text, WINDOW);
    expect(warnings).toEqual([]);
    expect(events.map((e) => [e.uid, lcdClock(e.start, TZ), (e.end - e.start) / 60_000])).toEqual([
      ['a', '10:00A', 30],
      ['b', '11:00A', 60],
      ['c', '3:00P', 0],
    ]);
  });

  it('marks all-day events', () => {
    const { events } = parseIcs(cal(vevent(['UID:d', 'SUMMARY:Trash night', 'DTSTART;VALUE=DATE:20261119'])), WINDOW);
    expect(events[0]?.allDay).toBe(true);
    expect(events[0]?.start).toBe(at('2026-11-19', 0));
    expect(events[0]?.end).toBe(at('2026-11-20', 0));
  });

  it('reads location, escaped text and GEO', () => {
    const { events } = parseIcs(
      cal(vevent(['UID:e', 'SUMMARY:Cleaning\\, 6 month', 'LOCATION:400 Lantern St\\, Hollow Creek', 'GEO:42.031;-87.962', 'DTSTART:20261119T163000Z'])),
      WINDOW,
    );
    expect(events[0]).toMatchObject({ summary: 'Cleaning, 6 month', location: '400 Lantern St, Hollow Creek', geo: { lat: 42.031, lon: -87.962 } });
  });

  it('skips cancelled events and events outside the window', () => {
    const { events } = parseIcs(
      cal(
        vevent(['UID:x', 'STATUS:CANCELLED', 'DTSTART:20261119T160000Z']),
        vevent(['UID:old', 'DTSTART:20200101T160000Z']),
        vevent(['UID:keep', 'DTSTART:20261119T160000Z']),
      ),
      WINDOW,
    );
    expect(events.map((e) => e.uid)).toEqual(['keep']);
  });

  it('ignores nested components such as alarms', () => {
    const { events } = parseIcs(
      cal(vevent(['UID:f', 'SUMMARY:Outer', 'DTSTART:20261119T160000Z', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'SUMMARY:Inner', 'END:VALARM'])),
      WINDOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Outer');
  });

  it('keeps a weekly 9:00 AM meeting at 9:00 AM across the fall-back change', () => {
    const { events } = parseIcs(
      cal(vevent(['UID:w', 'SUMMARY:Therapy', 'DTSTART;TZID=America/Chicago:20261021T090000', 'DURATION:PT50M', 'RRULE:FREQ=WEEKLY;COUNT=4'])),
      WINDOW,
    );
    expect(events.map((e) => lcdClock(e.start, TZ))).toEqual(['9:00A', '9:00A', '9:00A', '9:00A']);
    const gaps = events.slice(1).map((e, i) => (e.start - events[i]!.start) / 3_600_000);
    expect(gaps).toEqual([168, 169, 168]); // the week containing 1 November is an hour longer
  });

  it('expands BYDAY, INTERVAL, UNTIL and EXDATE', () => {
    const { events } = parseIcs(
      cal(
        vevent([
          'UID:gym',
          'SUMMARY:Gym',
          'DTSTART;TZID=America/Chicago:20261102T180000',
          'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;UNTIL=20261114T000000Z',
          'EXDATE;TZID=America/Chicago:20261104T180000',
        ]),
      ),
      WINDOW,
    );
    expect(events.map((e) => new Date(e.start).toISOString().slice(0, 10))).toEqual([
      '2026-11-03', // Mon 2 Nov 6 PM CST is 3 Nov in UTC
      '2026-11-07',
      '2026-11-10',
      '2026-11-12',
      '2026-11-14', // UNTIL is inclusive: Fri 13 Nov 6 PM CST is exactly 00:00Z on the 14th
    ]);
  });

  it('expands daily and monthly rules', () => {
    const daily = parseIcs(cal(vevent(['UID:m', 'DTSTART:20261119T150000Z', 'RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3'])), WINDOW);
    expect(daily.events.map((e) => new Date(e.start).toISOString().slice(5, 10))).toEqual(['11-19', '11-21', '11-23']);
    const monthly = parseIcs(cal(vevent(['UID:r', 'DTSTART;TZID=America/Chicago:20260831T090000', 'RRULE:FREQ=MONTHLY;COUNT=3'])), WINDOW);
    // 31 Sep and 31 Nov do not exist and are skipped
    expect(monthly.events.map((e) => new Date(e.start).toISOString().slice(0, 10))).toEqual(['2026-08-31', '2026-10-31', '2026-12-31']);
  });

  it('replaces one occurrence with its RECURRENCE-ID override', () => {
    const { events } = parseIcs(
      cal(
        vevent(['UID:s', 'SUMMARY:Stand-up', 'DTSTART;TZID=America/Chicago:20261116T093000', 'RRULE:FREQ=DAILY;COUNT=3']),
        vevent(['UID:s', 'SUMMARY:Stand-up (moved)', 'RECURRENCE-ID;TZID=America/Chicago:20261117T093000', 'DTSTART;TZID=America/Chicago:20261117T110000']),
      ),
      WINDOW,
    );
    expect(events.map((e) => [e.summary, lcdClock(e.start, TZ)])).toEqual([
      ['Stand-up', '9:30A'],
      ['Stand-up (moved)', '11:00A'],
      ['Stand-up', '9:30A'],
    ]);
  });

  it('maps Windows zone names and warns on unknown zones', () => {
    const { events, warnings } = parseIcs(
      cal(
        vevent(['UID:1', 'DTSTART;TZID=Eastern Standard Time:20261119T120000']),
        vevent(['UID:2', 'DTSTART;TZID=Custom/Nowhere:20261119T120000']),
      ),
      WINDOW,
    );
    expect(events.map((e) => lcdClock(e.start, TZ))).toEqual(['11:00A', '12:00P']);
    expect(warnings).toEqual(['Unknown time zone "Custom/Nowhere"; using America/Chicago.']);
  });

  it('warns about unsupported rules and files that are not calendars', () => {
    const yearly = parseIcs(cal(vevent(['UID:y', 'DTSTART:20261119T150000Z', 'RRULE:FREQ=YEARLY'])), WINDOW);
    expect(yearly.events).toHaveLength(1);
    expect(yearly.warnings[0]).toContain('FREQ=YEARLY');
    expect(parseIcs('hello', WINDOW).warnings).toEqual(['This does not look like an .ics calendar file.']);
  });
});

describe('import into commitments', () => {
  const window = WINDOW;

  it('matches saved places, video calls, GEO and unknown locations', () => {
    const { events } = parseIcs(
      cal(
        vevent(['UID:1', 'SUMMARY:Cleaning', 'LOCATION:Hollow Creek Dental', 'DTSTART:20261119T163000Z']),
        vevent(['UID:2', 'SUMMARY:1:1', 'LOCATION:https://meet.example.com/abc', 'DTSTART:20261119T170000Z']),
        vevent(['UID:3', 'SUMMARY:Party', 'LOCATION:Old Mill Hall', 'GEO:41.99;-88.05', 'DTSTART:20261120T010000Z']),
        vevent(['UID:4', 'SUMMARY:Haircut', 'LOCATION:Shear Fright Salon', 'DTSTART:20261120T020000Z']),
        vevent(['UID:5', 'SUMMARY:Call back', 'DTSTART:20261120T030000Z']),
      ),
      window,
    );
    const { commitments, newPlaces } = icsToCommitments(events, PLACES, { prepMinutes: 15, priority: 'normal' });
    expect(commitments.map((c) => c.placeId)).toEqual(['dental', 'online', 'geo-41.9900--88.0500', 'loc-shear-fright-salon', null]);
    expect(newPlaces.map((p) => p.id)).toEqual(['geo-41.9900--88.0500', 'loc-shear-fright-salon']);
    expect(commitments[0]).toMatchObject({ id: 'ics-1', prepMinutes: 15, priority: 'normal', source: 'ics' });
  });

  it('matches a place by address inside a longer location', () => {
    expect(matchPlace('Ironbark Gym, 9 Foundry Ln, Hollow Creek', PLACES)?.id).toBe('gym');
    expect(matchPlace('Somewhere else', PLACES)).toBeNull();
  });

  it('re-importing updates times but keeps the prep and priority the user tuned', () => {
    const { events } = parseIcs(cal(vevent(['UID:1', 'SUMMARY:Cleaning', 'DTSTART:20261119T163000Z'])), window);
    const first = icsToCommitments(events, PLACES, { prepMinutes: 15, priority: 'normal' }).commitments;
    const tuned = first.map((c) => ({ ...c, prepMinutes: 45, priority: 'must' as const }));
    const moved = parseIcs(cal(vevent(['UID:1', 'SUMMARY:Cleaning', 'DTSTART:20261119T173000Z'])), window).events;
    const merged = mergeCommitments(tuned, icsToCommitments(moved, PLACES, { prepMinutes: 15, priority: 'normal' }).commitments);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ prepMinutes: 45, priority: 'must', start: Date.parse('2026-11-19T17:30:00Z') });
  });
});
