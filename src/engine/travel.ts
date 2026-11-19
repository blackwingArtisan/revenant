import { HOUR } from './time';
import type { Commitment, GeoPoint, Place, TravelMode } from './types';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Average door-to-door speed and fixed overhead (parking, waiting, locking the bike). */
export const MODE_PROFILE: Record<TravelMode, { kmh: number; overheadMin: number }> = {
  car: { kmh: 35, overheadMin: 6 },
  transit: { kmh: 18, overheadMin: 8 },
  bike: { kmh: 15, overheadMin: 3 },
  walk: { kmh: 4.8, overheadMin: 1 },
};

/** Roads are not straight lines. */
export const DETOUR_FACTOR = 1.3;

/** Deterministic straight-line travel estimate in whole minutes. */
export function straightLineMinutes(from: GeoPoint, to: GeoPoint, mode: TravelMode): number {
  const km = haversineKm(from, to) * DETOUR_FACTOR;
  if (km < 0.05) return 0;
  const profile = MODE_PROFILE[mode];
  return Math.ceil(profile.overheadMin + (km / profile.kmh) * 60);
}

/** How long before an origin is considered "where you are": back-to-back plans chain. */
export const CHAIN_WINDOW_MS = 3 * HOUR;

/**
 * Where the user will be leaving from: the place of the latest physical
 * appointment that ends before this one starts (within the chain window),
 * otherwise home.
 */
export function originFor(
  commitment: Commitment,
  commitments: Commitment[],
  places: Map<string, Place>,
  homePlaceId: string | null,
): Place | null {
  let best: Commitment | null = null;
  for (const other of commitments) {
    if (other.id === commitment.id || other.kind !== 'appointment' || other.allDay) continue;
    if (!other.placeId || other.placeId === commitment.placeId) continue;
    const place = places.get(other.placeId);
    if (!place || place.virtual) continue;
    if (other.end > commitment.start || commitment.start - other.end > CHAIN_WINDOW_MS) continue;
    if (!best || other.end > best.end || (other.end === best.end && other.id < best.id)) best = other;
  }
  if (best?.placeId) return places.get(best.placeId) ?? null;
  return homePlaceId ? (places.get(homePlaceId) ?? null) : null;
}
