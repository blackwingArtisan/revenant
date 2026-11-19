import { leaveTime } from '../engine/plan';
import { originFor } from '../engine/travel';
import type { Commitment, Place, Settings } from '../engine/types';
import type { TravelEstimator } from './travel';

const coordKey = (p: Place) => (p.point ? `@${p.point.lat},${p.point.lon}` : '');

/**
 * Ask the travel adapter for each physical appointment's minutes, leaving from
 * home or from the previous appointment. Results are cached by route, mode and
 * departure hour, so re-planning on every edit stays cheap with a paid router.
 */
export async function resolveTravel(
  commitments: Commitment[],
  places: Place[],
  settings: Settings,
  estimator: TravelEstimator,
  cache: Map<string, number | null> = new Map(),
): Promise<Record<string, number>> {
  const byId = new Map(places.map((p) => [p.id, p]));
  const out: Record<string, number> = {};
  for (const c of commitments) {
    if (c.kind !== 'appointment' || c.allDay || !c.placeId) continue;
    const to = byId.get(c.placeId);
    if (!to) continue;
    if (to.virtual) {
      out[c.id] = 0;
      continue;
    }
    const from = originFor(c, commitments, byId, settings.homePlaceId);
    if (!from || from.id === to.id) {
      if (from?.id === to.id) out[c.id] = 0;
      continue;
    }
    const departAt = leaveTime(c, settings.defaultTravelMinutes, settings);
    // Coordinates are part of the key: a place that gets geocoded later must not reuse the answer for "unknown".
    const key = `${from.id}${coordKey(from)}>${to.id}${coordKey(to)}|${settings.travelMode}|${Math.floor(departAt / 3_600_000)}`;
    let minutes = cache.get(key);
    if (minutes === undefined) {
      try {
        minutes = await estimator.estimateMinutes({ from, to, departAt, mode: settings.travelMode });
      } catch {
        minutes = null;
      }
      cache.set(key, minutes);
    }
    if (minutes !== null) out[c.id] = minutes;
  }
  return out;
}
