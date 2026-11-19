import { describe, expect, it, vi } from 'vitest';
import { locatePlace, placeForTypedAddress, RelayGeocoder, SavedPlacesGeocoder, type Geocoder } from '../../src/adapters/geocode';
import { resolveTravel } from '../../src/adapters/resolve-travel';
import { selectAdapters } from '../../src/adapters/select';
import { StraightLineTravel } from '../../src/adapters/travel';
import { appt, at, PLACES, settings } from './helpers';

const asFetch = (fn: unknown) => fn as typeof fetch;

describe('local geocoder', () => {
  const geocoder = new SavedPlacesGeocoder(() => PLACES);

  it('finds a saved place by its address or name, with its own coordinates', async () => {
    expect(await geocoder.geocode('400 Lantern St, Hollow Creek')).toEqual({ lat: 42.031, lon: -87.962, label: 'Hollow Creek Dental' });
    expect(await geocoder.geocode('ironbark gym')).toEqual({ lat: 42.046, lon: -88.009, label: 'Ironbark Gym' });
  });

  it('returns null for an address it does not know, and never invents coordinates', async () => {
    expect(await geocoder.geocode('22 Elm Court, Hollow Creek')).toBeNull();
    expect(await geocoder.geocode('   ')).toBeNull();
  });

  it('skips places without coordinates and video places', async () => {
    const noCoords = new SavedPlacesGeocoder(() => [{ id: 'x', name: 'Willow Clinic', address: '22 Elm Court', point: null }, PLACES[3]!]);
    expect(await noCoords.geocode('Willow Clinic')).toBeNull();
    expect(await noCoords.geocode('Video or phone call')).toBeNull();
  });

  it('is the default, and the relay geocoder follows the travel switch', () => {
    expect(selectAdapters({}).geocoder).toBeInstanceOf(SavedPlacesGeocoder);
    expect(selectAdapters({ VITE_TRAVEL: 'relay' }).geocoder).toBeInstanceOf(SavedPlacesGeocoder);
    expect(selectAdapters({ VITE_TRAVEL: 'relay', VITE_RELAY_URL: 'https://relay.example.com' }).geocoder).toBeInstanceOf(RelayGeocoder);
  });
});

describe('relay geocoder', () => {
  it('posts the address with the shared secret and returns the position and label', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ lat: 42.018, lon: -87.981, label: '22 Elm Court, Hollow Creek' }), { status: 200 }));
    const g = new RelayGeocoder('https://relay.example.com/', 'token', asFetch(fetchImpl));
    expect(await g.geocode('22 Elm Court')).toEqual({ lat: 42.018, lon: -87.981, label: '22 Elm Court, Hollow Creek' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/geocode');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-relay-secret']).toBe('token');
    expect(JSON.parse(init.body as string)).toEqual({ address: '22 Elm Court' });
  });

  it('returns null on 404, on other errors and on a malformed answer', async () => {
    expect(await new RelayGeocoder('https://relay.example.com', 't', asFetch(async () => new Response('{"error":"no match"}', { status: 404 }))).geocode('x')).toBeNull();
    expect(await new RelayGeocoder('https://relay.example.com', 't', asFetch(async () => new Response('{}', { status: 501 }))).geocode('x')).toBeNull();
    expect(await new RelayGeocoder('https://relay.example.com', 't', asFetch(async () => new Response('{"lat":"north"}', { status: 200 }))).geocode('x')).toBeNull();
    expect(await new RelayGeocoder('https://relay.example.com', 't', asFetch(async () => new Response('{"lat":99,"lon":0}', { status: 200 }))).geocode('x')).toBeNull();
  });

  it('returns null when the network fails', async () => {
    const g = new RelayGeocoder('https://relay.example.com', 't', asFetch(async () => Promise.reject(new TypeError('offline'))));
    expect(await g.geocode('22 Elm Court')).toBeNull();
  });
});

describe('travel after geocoding', () => {
  it('uses the new coordinates instead of the cached "unknown" answer', async () => {
    const typed = { id: 'typed', name: '22 Elm Court', address: '22 Elm Court', point: null };
    const places = [...PLACES, typed];
    const c = appt({ id: 'visit', start: at('2026-11-19', 14), placeId: 'typed' });
    const cache = new Map<string, number | null>();
    const travel = new StraightLineTravel();
    expect(await resolveTravel([c], places, settings(), travel, cache)).toEqual({});
    const located = places.map((p) => (p.id === 'typed' ? { ...p, point: { lat: 42.018, lon: -87.981 } } : p));
    const out = await resolveTravel([c], located, settings(), travel, cache);
    expect(out['visit']).toBeGreaterThan(0);
  });
});

describe('typed addresses', () => {
  const stub = (answer: Awaited<ReturnType<Geocoder['geocode']>> | 'throw') => {
    const calls: string[] = [];
    const geocoder: Geocoder = {
      name: 'stub',
      async geocode(address) {
        calls.push(address);
        if (answer === 'throw') throw new Error('down');
        return answer;
      },
    };
    return { geocoder, calls };
  };

  it('uses a saved place when the address matches one, and makes a new place otherwise', () => {
    const known = placeForTypedAddress('400 Lantern St, Hollow Creek', PLACES, () => 'new-1');
    expect(known).toEqual({ place: PLACES[1], created: false });
    const fresh = placeForTypedAddress('  22 Elm Court, Hollow Creek ', PLACES, () => 'new-1');
    expect(fresh).toEqual({
      place: { id: 'new-1', name: '22 Elm Court, Hollow Creek', address: '22 Elm Court, Hollow Creek', point: null },
      created: true,
    });
  });

  it('stores the coordinates the geocoder found, asking exactly once', async () => {
    const { geocoder, calls } = stub({ lat: 42.018, lon: -87.981, label: '22 Elm Court' });
    const { place } = placeForTypedAddress('22 Elm Court', PLACES, () => 'new-1');
    const located = await locatePlace(place, geocoder);
    expect(located.point).toEqual({ lat: 42.018, lon: -87.981 });
    expect(located).toMatchObject({ id: 'new-1', name: '22 Elm Court', address: '22 Elm Court' });
    expect(calls).toEqual(['22 Elm Court']);
  });

  it('keeps the place without coordinates when there is no result or the geocoder fails', async () => {
    const { place } = placeForTypedAddress('22 Elm Court', PLACES, () => 'new-1');
    expect(await locatePlace(place, stub(null).geocoder)).toEqual(place);
    expect(await locatePlace(place, stub('throw').geocoder)).toEqual(place);
  });

  it('does not ask again for a place that already has coordinates, or for a video place', async () => {
    const { geocoder, calls } = stub({ lat: 1, lon: 2, label: 'x' });
    await locatePlace(PLACES[1]!, geocoder);
    await locatePlace(PLACES[3]!, geocoder);
    expect(calls).toEqual([]);
  });

  it('then plans travel from the stored coordinates instead of the default', async () => {
    const { place } = placeForTypedAddress('22 Elm Court', PLACES, () => 'typed');
    const c = appt({ id: 'visit', start: at('2026-11-19', 14), placeId: 'typed' });
    const travel = new StraightLineTravel();
    expect(await resolveTravel([c], [...PLACES, place], settings(), travel)).toEqual({});
    const located = await locatePlace(place, stub({ lat: 42.018, lon: -87.981, label: 'x' }).geocoder);
    expect((await resolveTravel([c], [...PLACES, located], settings(), travel))['visit']).toBeGreaterThan(0);
  });
});
