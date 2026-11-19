import { CalculateRoutesCommand } from '@aws-sdk/client-geo-routes';
import { SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { CreateScheduleCommand, DeleteScheduleCommand, ListSchedulesCommand } from '@aws-sdk/client-scheduler';
import { describe, expect, it } from 'vitest';
import { atExpression, createRelay, scheduleName, smsBody, type RelayDeps, type RelayRequest } from '../../src/relay/handler';

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
      ...overrides,
    },
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
    const res = await createRelay(d).http(req('/page', { to: '+15555550123', code: '911', text: 'LEAVE NOW: DENTIST' }));
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

  it('rejects numbers that are not E.164', async () => {
    const { d } = deps();
    expect((await createRelay(d).http(req('/page', { to: '555-0123', code: '911', text: 'x' }))).status).toBe(400);
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
      req('/schedule', { to: '+15555550123', alerts: [{ id: 'd:leave-now#0', at: Date.parse('2026-11-19T16:10:00Z'), code: '911', text: 'LEAVE NOW' }] }),
    );
    expect(res).toMatchObject({ status: 200, body: { scheduled: ['page-d_leave-now_0'] } });
    expect(sent.map((c) => (c as object).constructor.name)).toEqual(['CreateScheduleCommand', 'DeleteScheduleCommand', 'CreateScheduleCommand']);
  });

  it('schedules one self-deleting EventBridge schedule per beep', async () => {
    const { d, sent } = deps();
    const res = await createRelay(d).http(
      req('/schedule', { to: '+15555550123', alerts: [{ id: 'd:leave-now#0', at: Date.parse('2026-11-19T16:10:00Z'), code: '911', text: 'LEAVE NOW' }] }),
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
    expect(JSON.parse(cmd.input.Target!.Input!)).toEqual({ kind: 'scheduled-page', to: '+15555550123', code: '911', text: 'LEAVE NOW' });
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
    expect(await createRelay(d).scheduled({ kind: 'scheduled-page', to: '+15555550123', code: '411', text: 'GET READY' })).toEqual({
      messageId: 'msg-1',
    });
    expect((sent[0] as SendTextMessageCommand).input.MessageBody).toBe('411 GET READY');
  });

  it('maps upstream errors to 502 and unknown paths to 404', async () => {
    const { d } = deps();
    d.sms = { send: async () => Promise.reject(Object.assign(new Error('x'), { name: 'ThrottlingException' })) };
    expect(await createRelay(d).http(req('/page', { to: '+15555550123', code: '911', text: 'x' }))).toEqual({
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
