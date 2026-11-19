import { matchPlace } from '../engine/importer';
import type { Place } from '../engine/types';

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

/** Port: turn a typed address into coordinates. Null means "no match"; callers keep their default travel time. */
export interface Geocoder {
  readonly name: string;
  geocode(address: string): Promise<GeocodeResult | null>;
}

/**
 * Free, offline, deterministic: finds the address among the saved places that
 * have coordinates. It never invents coordinates, so an unknown address stays unknown.
 */
export class SavedPlacesGeocoder implements Geocoder {
  readonly name = 'saved places';

  constructor(private readonly places: () => readonly Place[]) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    const located = this.places().filter((p) => p.point !== null && !p.virtual);
    const match = matchPlace(address, located);
    if (!match?.point) return null;
    return { lat: match.point.lat, lon: match.point.lon, label: match.name };
  }
}

/**
 * Real: asks the relay, which calls Amazon Location Service Places (Geocode).
 * Browser code never holds AWS credentials. Any failure, including a network
 * error, is "no match". Written and type-checked; not called by the app or
 * tests unless VITE_TRAVEL=relay.
 */
export class RelayGeocoder implements Geocoder {
  readonly name = 'amazon-location places (relay)';

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/geocode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-relay-secret': this.secret },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { lat?: unknown; lon?: unknown; label?: unknown };
      if (typeof body.lat !== 'number' || typeof body.lon !== 'number') return null;
      if (!Number.isFinite(body.lat) || !Number.isFinite(body.lon) || Math.abs(body.lat) > 90 || Math.abs(body.lon) > 180) return null;
      return { lat: body.lat, lon: body.lon, label: typeof body.label === 'string' ? body.label : address };
    } catch {
      return null;
    }
  }
}

/**
 * The place for an address the person typed. A saved place that matches is used
 * as is; otherwise a new place without coordinates is made (`created`), which
 * {@link locatePlace} can then try to fill in.
 */
export function placeForTypedAddress(address: string, saved: readonly Place[], newId: () => string): { place: Place; created: boolean } {
  const typed = address.trim();
  const known = matchPlace(typed, [...saved]);
  if (known) return { place: known, created: false };
  return { place: { id: newId(), name: typed, address: typed, point: null }, created: true };
}

/** Ask the geocoder once for a place's coordinates. No result or any failure leaves the place as it was. */
export async function locatePlace(place: Place, geocoder: Geocoder): Promise<Place> {
  if (place.point || place.virtual) return place;
  try {
    const found = await geocoder.geocode(place.address);
    return found ? { ...place, point: { lat: found.lat, lon: found.lon } } : place;
  } catch {
    return place;
  }
}
