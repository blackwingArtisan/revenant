import { straightLineMinutes } from '../engine/travel';
import type { Place, TravelMode } from '../engine/types';

export interface TravelRequest {
  from: Place;
  to: Place;
  /** Epoch ms of the planned departure, for traffic-aware routing. */
  departAt: number;
  mode: TravelMode;
}

/** Port: how many minutes from one place to another. Null means "unknown"; the plan uses its default. */
export interface TravelEstimator {
  readonly name: string;
  estimateMinutes(req: TravelRequest): Promise<number | null>;
}

/** Free, offline, deterministic: straight-line distance with a detour factor and a per-mode speed. */
export class StraightLineTravel implements TravelEstimator {
  readonly name = 'straight-line';

  async estimateMinutes(req: TravelRequest): Promise<number | null> {
    if (req.to.virtual) return 0;
    if (!req.from.point || !req.to.point) return null;
    return straightLineMinutes(req.from.point, req.to.point, req.mode);
  }
}

/**
 * Real: asks the relay, which calls Amazon Location Service (CalculateRoutes)
 * with the departure time so traffic is included. Browser code never holds AWS
 * credentials. Written and type-checked; not called by the app or tests unless
 * VITE_TRAVEL=relay.
 */
export class RelayTravel implements TravelEstimator {
  readonly name = 'amazon-location (relay)';

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async estimateMinutes(req: TravelRequest): Promise<number | null> {
    if (req.to.virtual) return 0;
    if (!req.from.point || !req.to.point) return null;
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/route-eta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-secret': this.secret },
      body: JSON.stringify({
        origin: [req.from.point.lon, req.from.point.lat],
        destination: [req.to.point.lon, req.to.point.lat],
        mode: req.mode,
        departAt: new Date(req.departAt).toISOString(),
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { minutes?: unknown };
    return typeof body.minutes === 'number' && Number.isFinite(body.minutes) ? body.minutes : null;
  }
}
