import { addDays } from './time';

/**
 * An invented calendar export for a given day, in the shape real calendar apps
 * produce (folded lines, TZID, escaped commas, a VALARM, a video link, a
 * recurring event). Used by the "try a sample calendar" button.
 */
export function sampleIcs(dayKey: string, timeZone: string): string {
  const d = dayKey.replace(/-/g, '');
  const tomorrow = addDays(dayKey, 1).replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Example Corp//Example Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:sample-therapy@example.com',
    'SUMMARY:Therapy',
    `DTSTART;TZID=${timeZone}:${d}T083000`,
    `DTEND;TZID=${timeZone}:${d}T092000`,
    'LOCATION:Willow Clinic\\, 22 Elm Court\\, Hollow Creek',
    'GEO:42.018;-87.981',
    'RRULE:FREQ=WEEKLY;COUNT=6',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:sample-review@example.com',
    'SUMMARY:Design review with the',
    '  product team',
    `DTSTART;TZID=${timeZone}:${d}T110000`,
    'DURATION:PT45M',
    'LOCATION:https://meet.example.com/haunted-hall',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:sample-vet@example.com',
    'SUMMARY:Vet: Pumpkin annual shots',
    `DTSTART;TZID=${timeZone}:${d}T163000`,
    `DTEND;TZID=${timeZone}:${d}T171500`,
    'LOCATION:Shadyside Animal Clinic\\, 610 Hemlock Dr',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:sample-party@example.com',
    'SUMMARY:Costume party',
    `DTSTART;TZID=${timeZone}:${tomorrow}T193000`,
    `DTEND;TZID=${timeZone}:${tomorrow}T230000`,
    'LOCATION:Old Mill Hall\\, 3 Millrace Way',
    'GEO:41.991;-88.052',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:sample-bins@example.com',
    'SUMMARY:Yard waste pickup',
    `DTSTART;VALUE=DATE:${d}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
