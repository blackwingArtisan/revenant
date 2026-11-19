import { BrowserNotificationChannel, RelaySmsChannel, type PagerChannel } from './channel';
import { RelayTravel, StraightLineTravel, type TravelEstimator } from './travel';

export interface AdapterEnv {
  VITE_TRAVEL?: string;
  VITE_CHANNEL?: string;
  VITE_RELAY_URL?: string;
  VITE_PAGER_NUMBER?: string;
  /** Single-user token the relay checks; set per deployment, never committed. */
  VITE_RELAY_SECRET?: string;
}

export interface Adapters {
  travel: TravelEstimator;
  channel: PagerChannel;
  /** Human-readable summary for the settings panel. */
  summary: string[];
}

/**
 * Pick adapters from the build environment. Everything defaults to the free
 * local path; a real adapter is chosen only when its variable says so and the
 * relay URL is set.
 */
export function selectAdapters(env: AdapterEnv): Adapters {
  const relay = env.VITE_RELAY_URL?.trim() ?? '';
  const secret = env.VITE_RELAY_SECRET ?? '';
  const travel: TravelEstimator =
    env.VITE_TRAVEL === 'relay' && relay ? new RelayTravel(relay, secret) : new StraightLineTravel();
  const channel: PagerChannel =
    env.VITE_CHANNEL === 'relay' && relay && env.VITE_PAGER_NUMBER
      ? new RelaySmsChannel(relay, env.VITE_PAGER_NUMBER, secret)
      : new BrowserNotificationChannel();
  return { travel, channel, summary: [`Travel: ${travel.name}`, `Out-of-app pages: ${channel.name}`] };
}
