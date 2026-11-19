import type { IcsEvent } from './ics';
import type { Commitment, Place, Priority } from './types';

const VIRTUAL_HINT = /\b(zoom|teams|meet\.google|google meet|webex|online|video call|phone call)\b|https?:\/\//i;

export interface ImportDefaults {
  prepMinutes: number;
  priority: Priority;
}

export interface ImportResult {
  commitments: Commitment[];
  /** Places created for locations the user had not saved yet. */
  newPlaces: Place[];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'place';
}

/** Find a saved place for a calendar LOCATION string. */
export function matchPlace(location: string, places: Place[]): Place | null {
  const needle = location.trim().toLowerCase();
  if (!needle) return null;
  for (const p of places) {
    const name = p.name.toLowerCase();
    const address = p.address.toLowerCase();
    if (needle === name || needle === address) return p;
  }
  for (const p of places) {
    const name = p.name.toLowerCase();
    const address = p.address.toLowerCase();
    if ((name.length >= 4 && needle.includes(name)) || (address.length >= 6 && needle.includes(address))) return p;
  }
  return null;
}

/**
 * Calendar events to commitments. Locations are matched to saved places;
 * video-call links become a virtual place; GEO coordinates become a new place;
 * any other location becomes a new place without coordinates (default travel).
 */
export function icsToCommitments(events: IcsEvent[], places: Place[], defaults: ImportDefaults): ImportResult {
  const known = [...places];
  const newPlaces: Place[] = [];
  const commitments: Commitment[] = [];

  const ensure = (place: Place): Place => {
    const existing = known.find((p) => p.id === place.id);
    if (existing) return existing;
    known.push(place);
    newPlaces.push(place);
    return place;
  };

  for (const ev of events) {
    let placeId: string | null = null;
    if (ev.location || ev.geo) {
      if (VIRTUAL_HINT.test(ev.location)) {
        placeId = ensure({ id: 'online', name: 'Online', address: 'Video or phone call', point: null, virtual: true }).id;
      } else {
        const match = ev.location ? matchPlace(ev.location, known) : null;
        if (match) placeId = match.id;
        else if (ev.geo) {
          placeId = ensure({
            id: `geo-${ev.geo.lat.toFixed(4)}-${ev.geo.lon.toFixed(4)}`,
            name: ev.location || 'Calendar location',
            address: ev.location || `${ev.geo.lat.toFixed(4)}, ${ev.geo.lon.toFixed(4)}`,
            point: ev.geo,
          }).id;
        } else {
          placeId = ensure({ id: `loc-${slug(ev.location)}`, name: ev.location, address: ev.location, point: null }).id;
        }
      }
    }
    commitments.push({
      id: `ics-${ev.uid}`,
      title: ev.summary,
      kind: 'appointment',
      start: ev.start,
      end: Math.max(ev.end, ev.start),
      placeId,
      prepMinutes: defaults.prepMinutes,
      priority: ev.allDay ? 'low' : defaults.priority,
      checkInEveryMinutes: null,
      source: 'ics',
      allDay: ev.allDay,
    });
  }
  return { commitments, newPlaces };
}

/**
 * Merge imported commitments. Re-importing the same file updates times and
 * places rather than duplicating, and keeps the prep time and priority the
 * user already tuned.
 */
export function mergeCommitments(existing: Commitment[], incoming: Commitment[]): Commitment[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) {
    const prev = byId.get(c.id);
    byId.set(c.id, prev && !c.allDay ? { ...c, prepMinutes: prev.prepMinutes, priority: prev.priority } : c);
  }
  return [...byId.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
