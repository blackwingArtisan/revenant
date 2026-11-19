/**
 * The relay: the small server-side piece of the real path. It runs as one AWS
 * Lambda function behind a Function URL and does three jobs the browser must
 * not do with AWS credentials:
 *
 *   POST /route-eta  Amazon Location Service CalculateRoutes, departure-time aware
 *   POST /geocode    Amazon Location Service Places (GeoPlaces v2 Geocode): address to coordinates
 *   POST /page       text a page now through Amazon End User Messaging SMS
 *   POST /schedule   create one-time EventBridge Scheduler schedules, one per
 *                    beep, so pages go out with the browser closed
 *   POST /ack        delete the pending repeats of an acknowledged page
 *
 * Scheduled beeps invoke the same function with a `scheduled-page` event.
 * Every AWS client is injected, so the logic is unit-tested with stubs and
 * never calls AWS in tests.
 *
 * Hardening (see "Threat model" in the spec's design.md): the relay only ever
 * texts the number in its own configuration and ignores any `to` a client
 * sends; it compares the shared secret in constant time; it caps how many
 * distinct pages, and how many texts per page, it sends in a day; and it
 * refuses requests from any browser origin but the configured one.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { CalculateRoutesCommand, type CalculateRoutesCommandOutput, type RouteTravelMode } from '@aws-sdk/client-geo-routes';
import { SendTextMessageCommand, type SendTextMessageCommandOutput } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { CreateScheduleCommand, DeleteScheduleCommand, ListSchedulesCommand, type ListSchedulesCommandOutput } from '@aws-sdk/client-scheduler';
import { localDayKey } from '../engine/time';

export interface RelayConfig {
  originationIdentity: string;
  schedulerTargetArn: string;
  schedulerRoleArn: string;
  scheduleGroup: string;
  sharedSecret: string;
  /** The one phone number this relay texts (E.164). Clients cannot choose a destination. */
  pagerNumber: string;
  /** Most distinct pages texted per local day. Matches the pager's daily beep budget. */
  dailyPageCap: number;
  /** Most texts per page: the first beep plus its repeats. */
  sendsPerPage: number;
  /** IANA zone whose midnight resets the daily cap. */
  timeZone: string;
  /** The PWA's origin. Requests carrying any other Origin header are refused; empty allows none. */
  allowedOrigin: string;
}

/** Defaults: six pages a day (the default beep budget), each with up to three repeats. */
export const DEFAULT_DAILY_PAGE_CAP = 6;
export const DEFAULT_SENDS_PER_PAGE = 4;
/** Largest batch `/schedule` accepts, and how far ahead a beep may be scheduled. */
export const MAX_SCHEDULE_BATCH = 64;
export const MAX_SCHEDULE_AHEAD_MS = 48 * 60 * 60 * 1000;

/**
 * Counts texts against the daily cap. `claim` records one text for a page and
 * answers false, recording nothing, when the text would go over a cap.
 */
export interface SendLedger {
  claim(dayKey: string, pageId: string, limits: { pages: number; sendsPerPage: number }): Promise<boolean>;
}

/**
 * In-memory ledger. In Lambda it lives as long as a warm execution environment,
 * so it bounds a burst but resets on a cold start; a durable ledger (for example
 * a DynamoDB conditional counter) can replace it behind the same interface.
 */
export class MemoryLedger implements SendLedger {
  private day = '';
  private readonly sends = new Map<string, number>();

  async claim(dayKey: string, pageId: string, limits: { pages: number; sendsPerPage: number }): Promise<boolean> {
    if (dayKey !== this.day) {
      this.day = dayKey;
      this.sends.clear();
    }
    const used = this.sends.get(pageId) ?? 0;
    if (used === 0 && this.sends.size >= limits.pages) return false;
    if (used >= limits.sendsPerPage) return false;
    this.sends.set(pageId, used + 1);
    return true;
  }
}

/** Constant-time comparison of two secrets of any length. */
export function secretsMatch(given: string | undefined, expected: string): boolean {
  if (!expected || typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * CORS headers for the Function URL. Without a configured origin no
 * `access-control-allow-origin` header is sent, so browsers on other sites are
 * refused by default.
 */
export function corsHeaders(allowedOrigin: string | undefined): Record<string, string> {
  const origin = allowedOrigin?.trim() ?? '';
  return {
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    'access-control-allow-headers': 'content-type,x-relay-secret',
    'access-control-allow-methods': 'POST,OPTIONS',
    'content-type': 'application/json',
  };
}

/** Narrow client shapes: anything with a matching `send` works, including the real SDK clients. */
export interface RoutesClient {
  send(command: CalculateRoutesCommand): Promise<Pick<CalculateRoutesCommandOutput, 'Routes'>>;
}

/**
 * Input of the GeoPlaces v2 `Geocode` operation, typed locally: the package
 * @aws-sdk/client-geo-places is not installed in this repository. Only the
 * fields the relay uses are listed.
 */
export interface GeocodeInput {
  QueryText: string;
  MaxResults: number;
}
/** The part of the `Geocode` output the relay reads. `Position` is [longitude, latitude]. */
export interface GeocodeOutput {
  ResultItems?: { Title?: string; Position?: number[]; Address?: { Label?: string } }[];
}
/** What `PlacesClient.send` receives: the operation input, wrapped the way SDK commands are. */
export class GeocodeRequest {
  constructor(readonly input: GeocodeInput) {}
}
/**
 * Narrow client shape for Amazon Location Service Places. An operator who adds
 * the SDK package wraps its client: `{ send: (r) => sdk.send(new GeocodeCommand(r.input)) }`.
 */
export interface PlacesClient {
  send(command: GeocodeRequest): Promise<GeocodeOutput>;
}
export interface SmsClient {
  send(command: SendTextMessageCommand): Promise<Pick<SendTextMessageCommandOutput, 'MessageId'>>;
}
export interface SchedulerClient {
  send(command: CreateScheduleCommand | DeleteScheduleCommand | ListSchedulesCommand): Promise<Partial<ListSchedulesCommandOutput>>;
}

export interface RelayDeps {
  routes: RoutesClient;
  /** Optional: without it, `/geocode` answers 501 and the app keeps its default travel time. */
  places?: PlacesClient;
  sms: SmsClient;
  scheduler: SchedulerClient;
  config: RelayConfig;
  /** Daily send cap bookkeeping; defaults to an in-memory ledger. */
  ledger?: SendLedger;
  /** Clock for the daily cap and schedule checks; defaults to `Date.now`. */
  now?: () => number;
}

export interface RelayRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

export interface RelayResponse {
  status: number;
  body: Record<string, unknown>;
}

/** The payload a schedule invokes the relay with. It carries no phone number. */
export interface ScheduledPageEvent {
  kind: 'scheduled-page';
  pageId: string;
  code: string;
  text: string;
}

const MODES: Record<string, RouteTravelMode> = {
  car: 'Car',
  walk: 'Pedestrian',
  bike: 'Scooter',
  transit: 'Car',
};

/** Longest address the relay will send to the geocoder. */
export const MAX_ADDRESS_LENGTH = 200;

export const E164 = /^\+[1-9]\d{6,14}$/;
/** A pager code: one to three groups of digits, like `911` or `911 911`. */
const CODE = /^\d{3,5}( \d{3,5}){0,2}$/;
/** SMS segments are 160 GSM characters; a pager message should fit in one. */
export const SMS_LIMIT = 160;

const bad = (message: string): RelayResponse => ({ status: 400, body: { error: message } });

function parseBody(body: string | null): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isLonLat(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

export function smsBody(code: string, text: string): string {
  return `${code} ${text}`.slice(0, SMS_LIMIT);
}

/** Scheduler names allow [0-9a-zA-Z-_.] up to 64 characters. */
export function scheduleName(alertId: string): string {
  return `page-${alertId.replace(/[^0-9a-zA-Z-_.]/g, '_')}`.slice(0, 64);
}

/** The page an alert belongs to: alert ids are `${pageId}#${level}`. */
export function pageIdOf(alertId: string): string {
  const i = alertId.lastIndexOf('#');
  return i > 0 ? alertId.slice(0, i) : alertId;
}

/** EventBridge Scheduler one-time expression: at(yyyy-mm-ddThh:mm:ss). */
export function atExpression(epochMs: number): string {
  return `at(${new Date(epochMs).toISOString().slice(0, 19)})`;
}

export function createRelay(deps: RelayDeps) {
  const { config } = deps;
  const ledger = deps.ledger ?? new MemoryLedger();
  const now = deps.now ?? (() => Date.now());
  const pagerReady = () => E164.test(config.pagerNumber);

  /** Texts the configured number, if the daily cap allows. Null when the cap is reached. */
  async function sendSms(pageId: string, code: string, text: string): Promise<{ messageId: string | null } | null> {
    const dayKey = localDayKey(now(), config.timeZone || 'UTC');
    const allowed = await ledger.claim(dayKey, pageId, { pages: config.dailyPageCap, sendsPerPage: config.sendsPerPage });
    if (!allowed) return null;
    const out = await deps.sms.send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: config.pagerNumber,
        OriginationIdentity: config.originationIdentity,
        MessageBody: smsBody(code, text),
        MessageType: 'TRANSACTIONAL',
      }),
    );
    return { messageId: out.MessageId ?? null };
  }

  async function routeEta(body: Record<string, unknown>): Promise<RelayResponse> {
    const { origin, destination, mode, departAt } = body;
    if (!isLonLat(origin) || !isLonLat(destination)) return bad('origin and destination must be [lon, lat]');
    const when = typeof departAt === 'string' && !Number.isNaN(Date.parse(departAt)) ? departAt : null;
    const out = await deps.routes.send(
      new CalculateRoutesCommand({
        Origin: origin,
        Destination: destination,
        TravelMode: MODES[typeof mode === 'string' ? mode : 'car'] ?? 'Car',
        OptimizeRoutingFor: 'FastestRoute',
        ...(when ? { DepartureTime: when } : { DepartNow: true }),
      }),
    );
    const seconds = out.Routes?.[0]?.Summary?.Duration;
    if (typeof seconds !== 'number') return { status: 502, body: { error: 'no route' } };
    return { status: 200, body: { minutes: Math.ceil(seconds / 60) } };
  }

  async function geocode(body: Record<string, unknown>): Promise<RelayResponse> {
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address) return bad('address is required');
    if (address.length > MAX_ADDRESS_LENGTH) return bad(`address must be at most ${MAX_ADDRESS_LENGTH} characters`);
    if (!deps.places) return { status: 501, body: { error: 'geocoding not configured' } };
    const out = await deps.places.send(new GeocodeRequest({ QueryText: address, MaxResults: 1 }));
    const first = out.ResultItems?.[0];
    const [lon, lat] = first?.Position ?? [];
    if (!first || typeof lon !== 'number' || typeof lat !== 'number' || !isLonLat([lon, lat])) {
      return { status: 404, body: { error: 'no match' } };
    }
    return { status: 200, body: { lat, lon, label: first.Address?.Label ?? first.Title ?? address } };
  }

  async function page(body: Record<string, unknown>): Promise<RelayResponse> {
    // Any `to` in the body is ignored: the relay only texts its configured number.
    const { pageId, code, text } = body;
    if (typeof pageId !== 'string' || !pageId) return bad('pageId is required');
    if (typeof code !== 'string' || !CODE.test(code) || typeof text !== 'string') return bad('code and text are required');
    const sent = await sendSms(pageId, code, text);
    if (!sent) return { status: 429, body: { error: 'daily page cap reached' } };
    return { status: 200, body: sent };
  }

  async function schedule(body: Record<string, unknown>): Promise<RelayResponse> {
    // Any `to` in the body is ignored: scheduled pages go to the configured number.
    const { alerts } = body;
    if (!Array.isArray(alerts)) return bad('alerts must be a list');
    if (alerts.length > MAX_SCHEDULE_BATCH) return bad(`at most ${MAX_SCHEDULE_BATCH} alerts per request`);
    const t = now();
    const valid: { id: string; at: number; code: string; text: string }[] = [];
    for (const a of alerts as unknown[]) {
      const alert = a as { id?: unknown; at?: unknown; code?: unknown; text?: unknown };
      if (typeof alert.id !== 'string' || typeof alert.at !== 'number' || typeof alert.code !== 'string' || typeof alert.text !== 'string') {
        return bad('each alert needs id, at, code and text');
      }
      if (!CODE.test(alert.code)) return bad('code must be digits, like 911');
      if (!Number.isFinite(alert.at) || alert.at < t - 60_000 || alert.at > t + MAX_SCHEDULE_AHEAD_MS) {
        return bad('alerts must be due within the next 48 hours');
      }
      valid.push({ id: alert.id, at: alert.at, code: alert.code, text: alert.text });
    }
    const created: string[] = [];
    for (const alert of valid) {
      const event: ScheduledPageEvent = { kind: 'scheduled-page', pageId: pageIdOf(alert.id), code: alert.code, text: alert.text };
      const name = scheduleName(alert.id);
      const create = () =>
        deps.scheduler.send(
          new CreateScheduleCommand({
            Name: name,
            GroupName: config.scheduleGroup,
            ScheduleExpression: atExpression(alert.at),
            ScheduleExpressionTimezone: 'UTC',
            FlexibleTimeWindow: { Mode: 'OFF' },
            ActionAfterCompletion: 'DELETE',
            Target: { Arn: config.schedulerTargetArn, RoleArn: config.schedulerRoleArn, Input: JSON.stringify(event) },
          }),
        );
      try {
        await create();
      } catch (err) {
        // Re-sending a plan (after a reload, say) replaces the schedule instead of failing.
        if (!(err instanceof Error && err.name === 'ConflictException')) throw err;
        await deps.scheduler.send(new DeleteScheduleCommand({ Name: name, GroupName: config.scheduleGroup }));
        await create();
      }
      created.push(name);
    }
    return { status: 200, body: { scheduled: created } };
  }

  async function ack(body: Record<string, unknown>): Promise<RelayResponse> {
    const { pageId } = body;
    if (typeof pageId !== 'string' || !pageId) return bad('pageId is required');
    const prefix = scheduleName(`${pageId}#`);
    const listed = await deps.scheduler.send(new ListSchedulesCommand({ GroupName: config.scheduleGroup, NamePrefix: prefix }));
    const deleted: string[] = [];
    for (const s of listed.Schedules ?? []) {
      if (!s.Name) continue;
      await deps.scheduler.send(new DeleteScheduleCommand({ Name: s.Name, GroupName: config.scheduleGroup }));
      deleted.push(s.Name);
    }
    return { status: 200, body: { deleted } };
  }

  return {
    async http(req: RelayRequest): Promise<RelayResponse> {
      if (!config.sharedSecret) return { status: 503, body: { error: 'relay not configured' } };
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== config.allowedOrigin) return { status: 403, body: { error: 'origin not allowed' } };
      if (!secretsMatch(req.headers['x-relay-secret'], config.sharedSecret)) return { status: 401, body: { error: 'unauthorized' } };
      if (req.method !== 'POST') return { status: 405, body: { error: 'POST only' } };
      const body = parseBody(req.body);
      if (!body) return bad('JSON object body required');
      if ((req.path === '/page' || req.path === '/schedule') && !pagerReady()) {
        return { status: 503, body: { error: 'pager number not configured' } };
      }
      try {
        switch (req.path) {
          case '/route-eta':
            return await routeEta(body);
          case '/geocode':
            return await geocode(body);
          case '/page':
            return await page(body);
          case '/schedule':
            return await schedule(body);
          case '/ack':
            return await ack(body);
          default:
            return { status: 404, body: { error: 'not found' } };
        }
      } catch (err) {
        return { status: 502, body: { error: err instanceof Error ? err.name : 'upstream error' } };
      }
    },

    /** A schedule fired. Texts the configured number unless the daily cap is reached. */
    async scheduled(event: ScheduledPageEvent): Promise<{ messageId: string | null; capped?: true }> {
      if (!pagerReady() || typeof event.code !== 'string' || typeof event.text !== 'string') return { messageId: null };
      const pageId = typeof event.pageId === 'string' && event.pageId ? event.pageId : `${event.code}:${event.text}`;
      const sent = await sendSms(pageId, event.code, event.text);
      return sent ?? { messageId: null, capped: true };
    },
  };
}
