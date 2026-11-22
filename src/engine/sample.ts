import { addDays, parseDayKey, zonedToEpoch, MINUTE } from './time';
import type { Commitment, OnCallSettings, Place, Settings } from './types';

/** The invented secondary used by the demo and the tests. `defaultSettings` leaves escalation off. */
export const SAMPLE_ON_CALL: OnCallSettings = { enabled: true, name: 'Sam' };

/** Invented places in an invented town. Coordinates are illustrative. */
export const SAMPLE_PLACES: Place[] = [
  { id: 'home', name: 'Home', address: '13 Raven Row, Hollow Creek', point: { lat: 42.0, lon: -88.0 } },
  { id: 'dental', name: 'Hollow Creek Dental', address: '400 Lantern St, Hollow Creek', point: { lat: 42.031, lon: -87.962 } },
  { id: 'school', name: 'Maplewood Elementary', address: '77 Orchard Ave, Hollow Creek', point: { lat: 41.984, lon: -88.021 } },
  { id: 'pharmacy', name: 'Crossroads Pharmacy', address: '1200 Mill Rd, Hollow Creek', point: { lat: 42.012, lon: -88.031 } },
  { id: 'gym', name: 'Ironbark Gym', address: '9 Foundry Ln, Hollow Creek', point: { lat: 42.046, lon: -88.009 } },
  { id: 'morgan', name: "Morgan's place", address: '58 Willow Bend, Hollow Creek', point: { lat: 41.962, lon: -87.948 } },
  { id: 'online', name: 'Online', address: 'Video or phone call', point: null, virtual: true },
];

export function defaultSettings(timeZone: string): Settings {
  return {
    timeZone,
    dailyBudget: 6,
    honestyFactor: 1.5,
    bufferMinutes: 5,
    escalationMinutes: [3, 6, 10],
    digestTime: { hour: 7, minute: 30 },
    homePlaceId: 'home',
    travelMode: 'car',
    defaultTravelMinutes: 20,
  };
}

interface SampleSpec {
  id: string;
  title: string;
  at: [number, number];
  minutes: number;
  placeId: string | null;
  prep: number;
  priority: Commitment['priority'];
  kind?: Commitment['kind'];
  checkIn?: number;
  allDay?: boolean;
}

const SAMPLE_DAY: SampleSpec[] = [
  { id: 'trash', title: 'Trash and recycling night', at: [0, 0], minutes: 24 * 60, placeId: null, prep: 0, priority: 'low', allDay: true },
  { id: 'standup', title: 'Team stand-up', at: [9, 30], minutes: 15, placeId: 'online', prep: 0, priority: 'normal' },
  { id: 'dentist', title: 'Dentist cleaning', at: [10, 30], minutes: 60, placeId: 'dental', prep: 20, priority: 'must' },
  { id: 'pharmacy', title: 'Pick up prescription', at: [12, 0], minutes: 15, placeId: 'pharmacy', prep: 5, priority: 'low' },
  { id: 'taxes', title: 'Quarterly taxes', at: [13, 0], minutes: 120, placeId: null, prep: 0, priority: 'normal', kind: 'focus', checkIn: 25 },
  { id: 'pickup', title: 'School pickup', at: [15, 15], minutes: 20, placeId: 'school', prep: 0, priority: 'must' },
  { id: 'gym', title: 'Gym', at: [18, 0], minutes: 60, placeId: 'gym', prep: 15, priority: 'low' },
  { id: 'dinner', title: "Dinner at Morgan's", at: [19, 30], minutes: 120, placeId: 'morgan', prep: 30, priority: 'normal' },
];

function toCommitment(s: SampleSpec, dayKey: string, timeZone: string, id: string): Commitment {
  const start = zonedToEpoch({ ...parseDayKey(dayKey), hour: s.at[0], minute: s.at[1] }, timeZone);
  return {
    id,
    title: s.title,
    kind: s.kind ?? 'appointment',
    start,
    end: start + s.minutes * MINUTE,
    placeId: s.placeId,
    prepMinutes: s.prep,
    priority: s.priority,
    checkInEveryMinutes: s.checkIn ?? null,
    source: 'sample',
    allDay: s.allDay ?? false,
  };
}

/** A realistic, over-full day used by the demo and the tests. */
export function sampleDay(dayKey: string, timeZone: string): Commitment[] {
  return SAMPLE_DAY.map((s) => toCommitment(s, dayKey, timeZone, `sample-${s.id}`));
}

/** Ids of invented past commitments start with this, so the app can label them as sample history. */
export const SAMPLE_HISTORY_PREFIX = 'sample-history-';
/** The weekly dinner also happened this many days before the sample day. */
export const SAMPLE_HISTORY_DAYS_AGO = [14, 7] as const;

export function isSampleHistory(commitmentId: string): boolean {
  return commitmentId.startsWith(SAMPLE_HISTORY_PREFIX);
}

/**
 * Invented history for the demo: the weekly dinner at Morgan's on the two
 * previous weeks, with its leave-now page never answered. Two missed pages of
 * one routine are enough for the learner to suggest more prep time during the
 * one-minute demo. The app labels these as sample history, never as real use.
 */
export function sampleHistory(dayKey: string, timeZone: string): Commitment[] {
  const dinner = SAMPLE_DAY.find((s) => s.id === 'dinner')!;
  return SAMPLE_HISTORY_DAYS_AGO.map((n) => toCommitment(dinner, addDays(dayKey, -n), timeZone, `${SAMPLE_HISTORY_PREFIX}dinner-${n}`));
}

/** The sample day plus its sample history. */
export function sampleWithHistory(dayKey: string, timeZone: string): Commitment[] {
  return [...sampleHistory(dayKey, timeZone), ...sampleDay(dayKey, timeZone)];
}
