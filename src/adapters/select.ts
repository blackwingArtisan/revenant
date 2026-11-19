import type { Place } from '../engine/types';
import { BrowserNotificationChannel, RelaySmsChannel, type PagerChannel } from './channel';
import { RelayGeocoder, SavedPlacesGeocoder, type Geocoder } from './geocode';
import { RelayTravel, StraightLineTravel, type TravelEstimator } from './travel';

export interface AdapterEnv {
  VITE_TRAVEL?: string;
  VITE_CHANNEL?: string;
  VITE_RELAY_URL?: string;
  /**
   * Single-user token the relay checks; set per deployment, never committed.
   * It ships in the browser bundle, so it is not a secret from anyone who can
   * load the app: the relay's server-side target, caps and origin check are
   * what limit misuse.
   */
  VITE_RELAY_SECRET?: string;
}

export interface Adapters {
  travel: TravelEstimator;
  geocoder: Geocoder;
  channel: PagerChannel;
  /** Human-readable summary for the settings panel. */
  summary: string[];
}

/**
 * Pick adapters from the build environment. Everything defaults to the free
 * local path; a real adapter is chosen only when its variable says so and the
 * relay URL is set.
 */
export function selectAdapters(env: AdapterEnv, savedPlaces: () => readonly Place[] = () => []): Adapters {
  const relay = env.VITE_RELAY_URL?.trim() ?? '';
  const secret = env.VITE_RELAY_SECRET ?? '';
  const travel: TravelEstimator =
    env.VITE_TRAVEL === 'relay' && relay ? new RelayTravel(relay, secret) : new StraightLineTravel();
  // Geocoding follows the travel switch: both are Amazon Location Service behind the relay.
  const geocoder: Geocoder =
    env.VITE_TRAVEL === 'relay' && relay ? new RelayGeocoder(relay, secret) : new SavedPlacesGeocoder(savedPlaces);
  const channel: PagerChannel =
    env.VITE_CHANNEL === 'relay' && relay
      ? new RelaySmsChannel(relay, secret)
      : new BrowserNotificationChannel();
  return { travel, geocoder, channel, summary: [`Travel: ${travel.name}`, `Addresses: ${geocoder.name}`, `Out-of-app pages: ${channel.name}`] };
}
