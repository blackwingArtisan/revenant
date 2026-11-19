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
 */
import { CalculateRoutesCommand, type CalculateRoutesCommandOutput, type RouteTravelMode } from '@aws-sdk/client-geo-routes';
import { SendTextMessageCommand, type SendTextMessageCommandOutput } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { CreateScheduleCommand, DeleteScheduleCommand, ListSchedulesCommand, type ListSchedulesCommandOutput } from '@aws-sdk/client-scheduler';

export interface RelayConfig {
  originationIdentity: string;
  schedulerTargetArn: string;
  schedulerRoleArn: string;
  scheduleGroup: string;
  sharedSecret: string;
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

export interface ScheduledPageEvent {
  kind: 'scheduled-page';
  to: string;
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

const E164 = /^\+[1-9]\d{6,14}$/;
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

/** EventBridge Scheduler one-time expression: at(yyyy-mm-ddThh:mm:ss). */
export function atExpression(epochMs: number): string {
  return `at(${new Date(epochMs).toISOString().slice(0, 19)})`;
}

export function createRelay(deps: RelayDeps) {
  const { config } = deps;

  async function sendSms(to: string, code: string, text: string) {
    const out = await deps.sms.send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: to,
        OriginationIdentity: config.originationIdentity,
        MessageBody: smsBody(code, text),
        MessageType: 'TRANSACTIONAL',
      }),
    );
    return out.MessageId ?? null;
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
    const { to, code, text } = body;
    if (typeof to !== 'string' || !E164.test(to)) return bad('to must be an E.164 phone number');
    if (typeof code !== 'string' || typeof text !== 'string') return bad('code and text are required');
    return { status: 200, body: { messageId: await sendSms(to, code, text) } };
  }

  async function schedule(body: Record<string, unknown>): Promise<RelayResponse> {
    const { to, alerts } = body;
    if (typeof to !== 'string' || !E164.test(to)) return bad('to must be an E.164 phone number');
    if (!Array.isArray(alerts)) return bad('alerts must be a list');
    const created: string[] = [];
    for (const a of alerts as unknown[]) {
      const alert = a as { id?: unknown; at?: unknown; code?: unknown; text?: unknown };
      if (typeof alert.id !== 'string' || typeof alert.at !== 'number' || typeof alert.code !== 'string' || typeof alert.text !== 'string') {
        return bad('each alert needs id, at, code and text');
      }
      const event: ScheduledPageEvent = { kind: 'scheduled-page', to, code: alert.code, text: alert.text };
      const name = scheduleName(alert.id);
      const fireAt = alert.at;
      const create = () =>
        deps.scheduler.send(
          new CreateScheduleCommand({
            Name: name,
            GroupName: config.scheduleGroup,
            ScheduleExpression: atExpression(fireAt),
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
      if (req.headers['x-relay-secret'] !== config.sharedSecret) return { status: 401, body: { error: 'unauthorized' } };
      if (req.method !== 'POST') return { status: 405, body: { error: 'POST only' } };
      const body = parseBody(req.body);
      if (!body) return bad('JSON object body required');
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

    async scheduled(event: ScheduledPageEvent): Promise<{ messageId: string | null }> {
      return { messageId: await sendSms(event.to, event.code, event.text) };
    },
  };
}
