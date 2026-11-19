import { defaultSettings } from '../../src/engine/sample';
import { zonedToEpoch } from '../../src/engine/time';
import type { Commitment, Place, Settings } from '../../src/engine/types';

export const TZ = 'America/Chicago';

/** Chicago wall time to epoch ms: at('2026-11-19', 10, 30). */
export function at(dayKey: string, hour: number, minute = 0, timeZone = TZ): number {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return zonedToEpoch({ year, month, day, hour, minute }, timeZone);
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(TZ), ...overrides };
}

export const PLACES: Place[] = [
  { id: 'home', name: 'Home', address: '13 Raven Row, Hollow Creek', point: { lat: 42.0, lon: -88.0 } },
  { id: 'dental', name: 'Hollow Creek Dental', address: '400 Lantern St, Hollow Creek', point: { lat: 42.031, lon: -87.962 } },
  { id: 'gym', name: 'Ironbark Gym', address: '9 Foundry Ln, Hollow Creek', point: { lat: 42.046, lon: -88.009 } },
  { id: 'online', name: 'Online', address: 'Video or phone call', point: null, virtual: true },
];

let seq = 0;
export function appt(overrides: Partial<Commitment> & { start: number }): Commitment {
  seq += 1;
  return {
    id: overrides.id ?? `c${seq}`,
    title: 'Dentist',
    kind: 'appointment',
    end: overrides.start + 60 * 60_000,
    placeId: 'dental',
    prepMinutes: 20,
    priority: 'normal',
    checkInEveryMinutes: null,
    source: 'manual',
    ...overrides,
  };
}

export const M = 60_000;
