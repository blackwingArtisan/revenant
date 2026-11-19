/**
 * AWS Lambda entry point for the relay (Function URL, payload format 2.0).
 * Real path only: written and type-checked, never run by the app or tests.
 * Deploy notes are in docs/real-path.md.
 */
import { GeoRoutesClient } from '@aws-sdk/client-geo-routes';
import { PinpointSMSVoiceV2Client } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import {
  corsHeaders,
  createRelay,
  DEFAULT_DAILY_PAGE_CAP,
  DEFAULT_SENDS_PER_PAGE,
  type RelayConfig,
  type ScheduledPageEvent,
} from './handler';

interface FunctionUrlEvent {
  rawPath: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const region = process.env.RELAY_REGION ?? 'us-east-1';

const positive = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const config: RelayConfig = {
  originationIdentity: process.env.RELAY_ORIGINATION_IDENTITY ?? '',
  schedulerTargetArn: process.env.RELAY_SCHEDULER_TARGET_ARN ?? '',
  schedulerRoleArn: process.env.RELAY_SCHEDULER_ROLE_ARN ?? '',
  scheduleGroup: process.env.RELAY_SCHEDULE_GROUP ?? 'revenant-pager',
  sharedSecret: process.env.RELAY_SHARED_SECRET ?? '',
  pagerNumber: process.env.RELAY_PAGER_NUMBER ?? '',
  dailyPageCap: positive(process.env.RELAY_DAILY_PAGE_CAP, DEFAULT_DAILY_PAGE_CAP),
  sendsPerPage: positive(process.env.RELAY_SENDS_PER_PAGE, DEFAULT_SENDS_PER_PAGE),
  timeZone: process.env.RELAY_TIME_ZONE ?? 'UTC',
  allowedOrigin: process.env.RELAY_ALLOWED_ORIGIN ?? '',
};

// `places` is left unset on purpose: @aws-sdk/client-geo-places is not a dependency yet, so
// `/geocode` answers 501 "geocoding not configured". To enable it, add the package and pass
// `places: { send: (r) => new GeoPlacesClient({ region }).send(new GeocodeCommand(r.input)) }`
// (see docs/real-path.md).
const relay = createRelay({
  routes: new GeoRoutesClient({ region }),
  sms: new PinpointSMSVoiceV2Client({ region }),
  scheduler: new SchedulerClient({ region }),
  config,
});

// No wildcard: without RELAY_ALLOWED_ORIGIN, browsers on every origin are refused.
const CORS = corsHeaders(config.allowedOrigin);

function isScheduled(event: unknown): event is ScheduledPageEvent {
  return typeof event === 'object' && event !== null && (event as { kind?: unknown }).kind === 'scheduled-page';
}

export async function handler(event: FunctionUrlEvent | ScheduledPageEvent): Promise<FunctionUrlResult | { messageId: string | null; capped?: true }> {
  if (isScheduled(event)) return relay.scheduled(event);
  if (event.requestContext.http.method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body ?? null);
  const res = await relay.http({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers: Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    body,
  });
  return { statusCode: res.status, headers: CORS, body: JSON.stringify(res.body) };
}
