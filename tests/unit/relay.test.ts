import { CalculateRoutesCommand } from '@aws-sdk/client-geo-routes';
import { SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { CreateScheduleCommand, DeleteScheduleCommand, ListSchedulesCommand } from '@aws-sdk/client-scheduler';
import { describe, expect, it } from 'vitest';
import {
  atExpression,
  corsHeaders,
  createRelay,
  GeocodeRequest,
  MAX_ADDRESS_LENGTH,
  MAX_SCHEDULE_BATCH,
  MemoryLedger,
  pageIdOf,
  scheduleName,
  secretsMatch,
  smsBody,
  type PlacesClient,
  type RelayDeps,
  type RelayRequest,
} from '../../src/relay/handler';

/** The relay's clock in these tests: 8:00 AM in Chicago on an invented demo day. */
const NOW = Date.parse('2026-11-19T14:00:00Z');

/** Stub AWS clients: record every command, return canned output. Nothing reaches AWS. */
function deps(overrides: Partial<RelayDeps['config']> = {}) {
  const sent: unknown[] = [];
  const d: RelayDeps = {
    routes: { send: async (c) => (sent.push(c), { Routes: [{ Summary: { Duration: 1250 } }] as never }) },
    sms: { send: async (c) => (sent.push(c), { MessageId: 'msg-1' }) },
    scheduler: {
      send: async (c) => {
        sent.push(c);
        return c instanceof ListSchedulesCommand ? { Schedules: [{ Name: 'page-d_leave-now_1' }, { Name: 'page-d_leave-now_2' }] as never } : {};
      },
    },
    config: {
      originationIdentity: 'pool-example',
      schedulerTargetArn: 'arn:aws:lambda:us-east-1:000000000000:function:relay',
      schedulerRoleArn: 'arn:aws:iam::000000000000:role/scheduler',
      scheduleGroup: 'revenant-pager',
      sharedSecret: 's3cret',
      pagerNumber: '+15555550123',
      dailyPageCap: 6,
      sendsPerPage: 4,
      timeZone: 'America/Chicago',
      allowedOrigin: 'https://pager.example.com',
      ...overrides,
    },
    now: () => NOW,
  };
  return { d, sent };
}

function req(path: string, body: unknown, secret = 's3cret'): RelayRequest {
  return { method: 'POST', path, headers: { 'x-relay-secret': secret }, body: JSON.stringify(body) };
}

describe('relay', () => {
  it('refuses requests without the shared secret, and refuses everything when unconfigured', async () => {
    const { d } = deps();
    expect((await createRelay(d).http(req('/page', {}, 'wrong'))).status).toBe(401);
    const unconfigured = deps({ sharedSecret: '' }).d;
    expect((await createRelay(unconfigured).http(req('/page', {}))).status).toBe(503);
  });

  it('asks Amazon Location for the fastest route at the departure time', async () => {
    const { d, sent } = deps();
    const res = await createRelay(d).http(
      req('/route-eta', { origin: [-88, 42], destination: [-87.962, 42.031], mode: 'car', departAt: '2026-11-19T16:00:00.000Z' }),
    );
    expect(res).toEqual({ status: 200, body: { minutes: 21 } });
    const cmd = sent[0] as CalculateRoutesCommand;
    expect(cmd).toBeInstanceOf(CalculateRoutesCommand);
    expect(cmd.input).toMatchObject({
      Origin: [-88, 42],
      Destination: [-87.962, 42.031],
      TravelMode: 'Car',
      OptimizeRoutingFor: 'FastestRoute',
      DepartureTime: '2026-11-19T16:00:00.000Z',
    });
  });

  it('validates route coordinates', async () => {
    const { d } = deps();
    expect((await createRelay(d).http(req('/route-eta', { origin: [200, 0], destination: [0, 0] }))).status).toBe(400);
  });

  it('texts a page in one SMS segment', async () => {
    const { d, sent } = deps();
    const res = await createRelay(d).http(req('/page', { pageId: 'd:leave-now', code: '911', text: 'LEAVE NOW: DENTIST' }));
    expect(res).toEqual({ status: 200, body: { messageId: 'msg-1' } });
    const cmd = sent[0] as SendTextMessageCommand;
    expect(cmd).toBeInstanceOf(SendTextMessageCommand);
    expect(cmd.input).toEqual({
      DestinationPhoneNumber: '+15555550123',
      OriginationIdentity: 'pool-example',
      MessageBody: '911 LEAVE NOW: DENTIST',
      MessageType: 'TRANSACTIONAL',
    });
    expect(smsBody('911', 'x'.repeat(300))).toHaveLength(160);
  });

  it('rejects a page without a page id or with a code that is not digits', async () => {
    const { d, sent } = deps();
    const relay = createRelay(d);
    expect((await relay.http(req('/page', { code: '911', text: 'x' }))).status).toBe(400);
    expect((await relay.http(req('/page', { pageId: 'p', code: 'CALL ME', text: 'x' }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('replaces an existing schedule of the same name instead of failing', async () => {
    const { d, sent } = deps();
    let conflicts = 1;
    const base = d.scheduler.send;
    d.scheduler.send = async (c) => {
      if (c instanceof CreateScheduleCommand && conflicts-- > 0) {
        sent.push(c);
        throw Object.assign(new Error('exists'), { name: 'ConflictException' });
      }
      return base(c);
    };
    const res = await createRelay(d).http(
      req('/schedule', { alerts: [{ id: 'd:leave-now#0', at: Date.parse('2026-11-19T16:10:00Z'), code: '911', text: 'LEAVE NOW' }] }),
    );
    expect(res).toMatchObject({ status: 200, body: { scheduled: ['page-d_leave-now_0'] } });
    expect(sent.map((c) => (c as object).constructor.name)).toEqual(['CreateScheduleCommand', 'DeleteScheduleCommand', 'CreateScheduleCommand']);
  });

  it('schedules one self-deleting EventBridge schedule per beep', async () => {
    const { d, sent } = deps();
    const res = await createRelay(d).http(
      req('/schedule', { alerts: [{ id: 'd:leave-now#0', at: Date.parse('2026-11-19T16:10:00Z'), code: '911', text: 'LEAVE NOW' }] }),
    );
    expect(res.body).toEqual({ scheduled: ['page-d_leave-now_0'] });
    const cmd = sent[0] as CreateScheduleCommand;
    expect(cmd).toBeInstanceOf(CreateScheduleCommand);
    expect(cmd.input).toMatchObject({
      Name: 'page-d_leave-now_0',
      ScheduleExpression: 'at(2026-11-19T16:10:00)',
      ScheduleExpressionTimezone: 'UTC',
      ActionAfterCompletion: 'DELETE',
      FlexibleTimeWindow: { Mode: 'OFF' },
    });
    expect(JSON.parse(cmd.input.Target!.Input!)).toEqual({ kind: 'scheduled-page', pageId: 'd:leave-now', code: '911', text: 'LEAVE NOW' });
  });

  it('ACK deletes the pending repeats of that page', async () => {
    const { d, sent } = deps();
    const res = await createRelay(d).http(req('/ack', { pageId: 'd:leave-now' }));
    expect(res.body).toEqual({ deleted: ['page-d_leave-now_1', 'page-d_leave-now_2'] });
    expect((sent[0] as ListSchedulesCommand).input).toEqual({ GroupName: 'revenant-pager', NamePrefix: 'page-d_leave-now_' });
    expect(sent.slice(1).every((c) => c instanceof DeleteScheduleCommand)).toBe(true);
  });

  it('sends the SMS when a schedule fires', async () => {
    const { d, sent } = deps();
    expect(await createRelay(d).scheduled({ kind: 'scheduled-page', pageId: 'd:get-ready', code: '411', text: 'GET READY' })).toEqual({
      messageId: 'msg-1',
    });
    expect((sent[0] as SendTextMessageCommand).input).toMatchObject({ DestinationPhoneNumber: '+15555550123', MessageBody: '411 GET READY' });
  });

  it('maps upstream errors to 502 and unknown paths to 404', async () => {
    const { d } = deps();
    d.sms = { send: async () => Promise.reject(Object.assign(new Error('x'), { name: 'ThrottlingException' })) };
    expect(await createRelay(d).http(req('/page', { pageId: 'p', code: '911', text: 'x' }))).toEqual({
      status: 502,
      body: { error: 'ThrottlingException' },
    });
    expect((await createRelay(d).http(req('/nope', {}))).status).toBe(404);
  });

  it('formats schedule names and expressions', () => {
    expect(scheduleName('a:b c#1')).toBe('page-a_b_c_1');
    expect(scheduleName('x'.repeat(100))).toHaveLength(64);
    expect(atExpression(Date.parse('2026-03-08T08:30:00.500Z'))).toBe('at(2026-03-08T08:30:00)');
  });
});

describe('relay hardening', () => {
  it('ignores a client-supplied phone number and texts only the configured one', async () => {
    const { d, sent } = deps();
    const relay = createRelay(d);
    await relay.http(req('/page', { to: '+15555550199', pageId: 'p', code: '911', text: 'LEAVE NOW' }));
    expect((sent[0] as SendTextMessageCommand).input.DestinationPhoneNumber).toBe('+15555550123');

    await relay.http(req('/schedule', { to: '+15555550199', alerts: [{ id: 'p#0', at: NOW + 60_000, code: '911', text: 'x' }] }));
    const payload = JSON.parse((sent[1] as CreateScheduleCommand).input.Target!.Input!) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('to');
    expect(JSON.stringify(payload)).not.toContain('+1555555');
  });

  it('refuses to send when no valid pager number is configured', async () => {
    for (const pagerNumber of ['', '555-0123']) {
      const { d, sent } = deps({ pagerNumber });
      const relay = createRelay(d);
      expect(await relay.http(req('/page', { pageId: 'p', code: '911', text: 'x' }))).toEqual({ status: 503, body: { error: 'pager number not configured' } });
      expect((await relay.http(req('/schedule', { alerts: [] }))).status).toBe(503);
      expect(await relay.scheduled({ kind: 'scheduled-page', pageId: 'p', code: '911', text: 'x' })).toEqual({ messageId: null });
      expect(sent).toHaveLength(0);
    }
  });

  it('compares secrets in constant time, whatever their length', () => {
    expect(secretsMatch('s3cret', 's3cret')).toBe(true);
    expect(secretsMatch('s3cre', 's3cret')).toBe(false);
    expect(secretsMatch('s3cret-and-more', 's3cret')).toBe(false);
    expect(secretsMatch(undefined, 's3cret')).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
  });

  it('caps distinct pages a day at the beep budget and texts per page at the first beep plus repeats', async () => {
    const { d, sent } = deps({ dailyPageCap: 2, sendsPerPage: 2 });
    const relay = createRelay(d);
    const page = (pageId: string) => relay.http(req('/page', { pageId, code: '911', text: 'x' }));
    expect((await page('a')).status).toBe(200);
    expect((await page('a')).status).toBe(200);
    expect(await page('a')).toEqual({ status: 429, body: { error: 'daily page cap reached' } });
    expect((await page('b')).status).toBe(200);
    expect((await page('c')).status).toBe(429);
    expect(await relay.scheduled({ kind: 'scheduled-page', pageId: 'd', code: '911', text: 'x' })).toEqual({ messageId: null, capped: true });
    expect(sent).toHaveLength(3);
  });

  it('starts a fresh cap at local midnight in the configured zone', async () => {
    const ledger = new MemoryLedger();
    let now = Date.parse('2026-11-20T05:59:00Z'); // 11:59 PM in Chicago
    const { d, sent } = deps({ dailyPageCap: 1 });
    const relay = createRelay({ ...d, ledger, now: () => now });
    expect((await relay.http(req('/page', { pageId: 'a', code: '911', text: 'x' }))).status).toBe(200);
    expect((await relay.http(req('/page', { pageId: 'b', code: '911', text: 'x' }))).status).toBe(429);
    now = Date.parse('2026-11-20T06:00:00Z'); // midnight in Chicago
    expect((await relay.http(req('/page', { pageId: 'b', code: '911', text: 'x' }))).status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it('accepts only small batches of beeps due within the next 48 hours', async () => {
    const { d, sent } = deps();
    const relay = createRelay(d);
    const one = (at: number) => ({ alerts: [{ id: 'p#0', at, code: '911', text: 'x' }] });
    expect((await relay.http(req('/schedule', one(NOW - 10 * 60_000)))).status).toBe(400);
    expect((await relay.http(req('/schedule', one(NOW + 49 * 3_600_000)))).status).toBe(400);
    const many = Array.from({ length: MAX_SCHEDULE_BATCH + 1 }, (_, i) => ({ id: `p${i}#0`, at: NOW + 60_000, code: '911', text: 'x' }));
    expect((await relay.http(req('/schedule', { alerts: many }))).status).toBe(400);
    expect((await relay.http(req('/schedule', { alerts: [{ id: 'p#0', at: NOW + 60_000, code: 'HELLO', text: 'x' }] }))).status).toBe(400);
    expect(sent).toHaveLength(0);
    expect((await relay.http(req('/schedule', one(NOW + 47 * 3_600_000)))).status).toBe(200);
  });

  it('refuses browsers on other origins, and every browser when no origin is configured', async () => {
    const withOrigin = (origin: string): RelayRequest => ({ ...req('/geocode', { address: 'x' }), headers: { 'x-relay-secret': 's3cret', origin } });
    const { d } = deps();
    expect(await createRelay(d).http(withOrigin('https://evil.example.net'))).toEqual({ status: 403, body: { error: 'origin not allowed' } });
    expect((await createRelay(d).http(withOrigin('https://pager.example.com'))).status).toBe(501);
    expect((await createRelay(deps({ allowedOrigin: '' }).d).http(withOrigin('https://pager.example.com'))).status).toBe(403);
  });

  it('sends no wildcard CORS header, and none at all without a configured origin', () => {
    expect(corsHeaders('https://pager.example.com')['access-control-allow-origin']).toBe('https://pager.example.com');
    expect(corsHeaders(undefined)).not.toHaveProperty('access-control-allow-origin');
    expect(corsHeaders('  ')).not.toHaveProperty('access-control-allow-origin');
    expect(Object.values(corsHeaders('https://pager.example.com'))).not.toContain('*');
  });

  it('maps alert ids back to their page', () => {
    expect(pageIdOf('d:leave-now#2')).toBe('d:leave-now');
    expect(pageIdOf('digest:2026-11-19')).toBe('digest:2026-11-19');
  });
});

describe('relay /geocode', () => {
  /** A stub Places client: records each request and answers from `items`. Nothing reaches AWS. */
  function withPlaces(items: Awaited<ReturnType<PlacesClient['send']>>['ResultItems']) {
    const { d } = deps();
    const requests: GeocodeRequest[] = [];
    d.places = { send: async (r) => (requests.push(r), { ResultItems: items }) };
    return { d, requests };
  }

  it('returns the first result position (lon, lat in AWS order) and label', async () => {
    const { d, requests } = withPlaces([
      { Title: '22 Elm Court', Position: [-87.981, 42.018], Address: { Label: '22 Elm Court, Hollow Creek' } },
      { Title: 'Second', Position: [-88, 42] },
    ]);
    const res = await createRelay(d).http(req('/geocode', { address: '  22 Elm Court ' }));
    expect(res).toEqual({ status: 200, body: { lat: 42.018, lon: -87.981, label: '22 Elm Court, Hollow Creek' } });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.input).toEqual({ QueryText: '22 Elm Court', MaxResults: 1 });
  });

  it('falls back to the title when a result has no address label', async () => {
    const { d } = withPlaces([{ Title: 'Willow Clinic', Position: [-87.9, 42.1] }]);
    expect((await createRelay(d).http(req('/geocode', { address: 'Willow Clinic' }))).body).toEqual({ lat: 42.1, lon: -87.9, label: 'Willow Clinic' });
  });

  it('answers 404 when there is no result or the position is unusable', async () => {
    for (const items of [[], undefined, [{ Title: 'No position' }], [{ Position: [500, 0] }]]) {
      const { d } = withPlaces(items);
      expect((await createRelay(d).http(req('/geocode', { address: 'Nowhere Lane' }))).status).toBe(404);
    }
  });

  it('rejects an empty, missing or overlong address with 400, without calling Places', async () => {
    const { d, requests } = withPlaces([{ Position: [-88, 42] }]);
    const relay = createRelay(d);
    expect((await relay.http(req('/geocode', { address: '   ' }))).status).toBe(400);
    expect((await relay.http(req('/geocode', {}))).status).toBe(400);
    expect((await relay.http(req('/geocode', { address: 42 }))).status).toBe(400);
    expect((await relay.http(req('/geocode', { address: 'x'.repeat(MAX_ADDRESS_LENGTH + 1) }))).status).toBe(400);
    expect((await relay.http(req('/geocode', { address: 'x'.repeat(MAX_ADDRESS_LENGTH) }))).status).toBe(200);
    expect(requests).toHaveLength(1);
  });

  it('answers 401 for a wrong secret, without calling Places', async () => {
    const { d, requests } = withPlaces([{ Position: [-88, 42] }]);
    expect((await createRelay(d).http(req('/geocode', { address: '22 Elm Court' }, 'wrong'))).status).toBe(401);
    expect(requests).toHaveLength(0);
  });

  it('answers 501 "geocoding not configured" when no Places client is set', async () => {
    const { d } = deps();
    expect(d.places).toBeUndefined();
    expect(await createRelay(d).http(req('/geocode', { address: '22 Elm Court' }))).toEqual({ status: 501, body: { error: 'geocoding not configured' } });
  });

  it('maps a Places failure to 502 with the error name', async () => {
    const { d } = deps();
    d.places = { send: async () => Promise.reject(Object.assign(new Error('slow down'), { name: 'ThrottlingException' })) };
    expect(await createRelay(d).http(req('/geocode', { address: '22 Elm Court' }))).toEqual({ status: 502, body: { error: 'ThrottlingException' } });
  });
});
