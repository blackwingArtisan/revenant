import { describe, expect, it, vi } from 'vitest';
import { BrowserNotificationChannel, MemoryChannel, RelaySmsChannel, type NotificationHost } from '../../src/adapters/channel';
import { SimClock } from '../../src/adapters/clock';
import { resolveTravel } from '../../src/adapters/resolve-travel';
import { selectAdapters } from '../../src/adapters/select';
import { isSnapshot, MemoryStore } from '../../src/adapters/storage';
import { RelayTravel, StraightLineTravel, type TravelEstimator } from '../../src/adapters/travel';
import { straightLineMinutes } from '../../src/engine/travel';
import type { Alert } from '../../src/engine/types';
import { appt, at, M, PLACES, settings } from './helpers';

const DAY = '2026-11-19';
const alert: Alert = { id: 'd:leave-now#0', pageId: 'd:leave-now', level: 0, at: 0, code: '911', text: 'LEAVE NOW: DENTIST', silent: false };

describe('SimClock', () => {
  it('pauses, jumps, runs fast and returns to now', () => {
    let real = 1_000_000;
    const clock = new SimClock(5_000, 0, () => real);
    real += 60_000;
    expect(clock.now()).toBe(5_000);
    clock.advance(15 * M);
    expect(clock.now()).toBe(5_000 + 15 * M);
    clock.setSpeed(60);
    real += 1000;
    expect(clock.now()).toBe(5_000 + 16 * M);
    clock.backToNow();
    expect(clock.now()).toBe(real);
    expect(clock.isLive).toBe(true);
  });
});

describe('travel adapters', () => {
  it('estimates straight-line minutes per mode, deterministically', async () => {
    const home = PLACES[0]!;
    const dental = PLACES[1]!;
    const t = new StraightLineTravel();
    const car = await t.estimateMinutes({ from: home, to: dental, departAt: 0, mode: 'car' });
    const walk = await t.estimateMinutes({ from: home, to: dental, departAt: 0, mode: 'walk' });
    expect(car).toBe(straightLineMinutes(home.point!, dental.point!, 'car'));
    expect(car).toBe(17); // 4.65 km x 1.3 detour at 35 km/h = 10.4 min, + 6 min parking, rounded up
    expect(walk).toBe(77); // 6.05 km at 4.8 km/h + 1 min
    expect(await t.estimateMinutes({ from: home, to: PLACES[3]!, departAt: 0, mode: 'car' })).toBe(0);
    expect(await t.estimateMinutes({ from: home, to: { ...dental, point: null }, departAt: 0, mode: 'car' })).toBeNull();
  });

  it('sends the relay a lon/lat route request with the departure time and secret', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ minutes: 22 }), { status: 200 }));
    const t = new RelayTravel('https://relay.example.com/', 'token', fetchImpl as unknown as typeof fetch);
    const minutes = await t.estimateMinutes({ from: PLACES[0]!, to: PLACES[1]!, departAt: Date.parse('2026-11-19T16:00:00Z'), mode: 'car' });
    expect(minutes).toBe(22);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/route-eta');
    expect((init.headers as Record<string, string>)['x-relay-secret']).toBe('token');
    expect(JSON.parse(init.body as string)).toEqual({
      origin: [-88, 42],
      destination: [-87.962, 42.031],
      mode: 'car',
      departAt: '2026-11-19T16:00:00.000Z',
    });
  });

  it('treats a relay failure as unknown', async () => {
    const t = new RelayTravel('https://relay.example.com', 'token', (async () => new Response('', { status: 500 })) as typeof fetch);
    expect(await t.estimateMinutes({ from: PLACES[0]!, to: PLACES[1]!, departAt: 0, mode: 'car' })).toBeNull();
  });

  it('resolves travel from home, or from the previous appointment, and caches routes', async () => {
    const calls: string[] = [];
    const estimator: TravelEstimator = {
      name: 'stub',
      async estimateMinutes(req) {
        calls.push(`${req.from.id}>${req.to.id}`);
        return 12;
      },
    };
    const dentist = appt({ id: 'dentist', start: at(DAY, 10), end: at(DAY, 11), placeId: 'dental' });
    const gym = appt({ id: 'gym', start: at(DAY, 12), placeId: 'gym' });
    const call = appt({ id: 'call', start: at(DAY, 14), placeId: 'online' });
    const cache = new Map<string, number | null>();
    const out = await resolveTravel([dentist, gym, call], PLACES, settings(), estimator, cache);
    expect(out).toEqual({ dentist: 12, gym: 12, call: 0 });
    expect(calls).toEqual(['home>dental', 'dental>gym']);
    await resolveTravel([dentist, gym, call], PLACES, settings(), estimator, cache);
    expect(calls).toHaveLength(2);
  });

  it('leaves out commitments whose route failed so the plan uses its default', async () => {
    const failing: TravelEstimator = { name: 'down', estimateMinutes: async () => Promise.reject(new Error('offline')) };
    const out = await resolveTravel([appt({ id: 'x', start: at(DAY, 10) })], PLACES, settings(), failing);
    expect(out).toEqual({});
  });
});

describe('channels', () => {
  function host(permission: NotificationPermission): NotificationHost & { shown: unknown[][] } {
    const shown: unknown[][] = [];
    return {
      shown,
      permission: () => permission,
      registration: async () => ({
        showNotification: async (...args: unknown[]) => {
          shown.push(args);
        },
        getNotifications: async () => [],
      }),
      vibrate: () => undefined,
    };
  }

  it('shows a service-worker notification with an ACK action when allowed', async () => {
    const h = host('granted');
    const receipt = await new BrowserNotificationChannel(h).deliver(alert);
    expect(receipt.delivered).toBe(true);
    const [title, options] = h.shown[0] as [string, NotificationOptions & { actions: { action: string }[] }];
    expect(title).toBe('911');
    expect(options.tag).toBe('d:leave-now');
    expect(options.actions[0]?.action).toBe('ack');
  });

  it('falls back to in-app only when notifications are not allowed, and never for silent pages', async () => {
    expect((await new BrowserNotificationChannel(host('denied')).deliver(alert)).delivered).toBe(false);
    const h = host('granted');
    expect((await new BrowserNotificationChannel(h).deliver({ ...alert, silent: true })).delivered).toBe(false);
    expect(h.shown).toHaveLength(0);
  });

  it('posts pages and ACKs to the relay, never naming a phone number', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ch = new RelaySmsChannel('https://relay.example.com', 'token', fetchImpl as unknown as typeof fetch);
    expect((await ch.deliver(alert)).delivered).toBe(true);
    await ch.withdraw('d:leave-now');
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies).toEqual([
      { pageId: 'd:leave-now', code: '911', text: 'LEAVE NOW: DENTIST' },
      { pageId: 'd:leave-now' },
    ]);
  });

  it('records deliveries in memory for tests', async () => {
    const ch = new MemoryChannel();
    await ch.deliver(alert);
    await ch.withdraw('d:leave-now');
    expect(ch.sent).toHaveLength(1);
    expect(ch.withdrawn).toEqual(['d:leave-now']);
  });
});

describe('adapter selection', () => {
  it('defaults to the free local adapters', () => {
    const a = selectAdapters({});
    expect(a.travel).toBeInstanceOf(StraightLineTravel);
    expect(a.channel).toBeInstanceOf(BrowserNotificationChannel);
  });

  it('chooses the relay only when configured', () => {
    expect(selectAdapters({ VITE_TRAVEL: 'relay' }).travel).toBeInstanceOf(StraightLineTravel);
    const a = selectAdapters({ VITE_TRAVEL: 'relay', VITE_CHANNEL: 'relay', VITE_RELAY_URL: 'https://relay.example.com' });
    expect(a.travel).toBeInstanceOf(RelayTravel);
    expect(a.channel).toBeInstanceOf(RelaySmsChannel);
  });
});

describe('storage', () => {
  it('round-trips a snapshot and rejects anything else', () => {
    const store = new MemoryStore();
    const snap = { version: 1 as const, commitments: [], places: PLACES, settings: settings(), runtime: { acks: {}, delivered: [] }, memory: [] };
    store.save(snap);
    expect(store.load()).toEqual(snap);
    expect(isSnapshot(snap)).toBe(true);
    expect(isSnapshot({ version: 2 })).toBe(false);
    store.clear();
    expect(store.load()).toBeNull();
  });
});
