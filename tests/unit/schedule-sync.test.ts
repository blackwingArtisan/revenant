import { describe, expect, it, vi } from 'vitest';
import { RelaySmsChannel } from '../../src/adapters/channel';
import { diffSchedules } from '../../src/adapters/schedule-sync';
import { alertsForPage } from '../../src/engine/alerts';
import { planDays } from '../../src/engine/plan';
import type { Commitment } from '../../src/engine/types';
import { appt, at, PLACES, settings } from './helpers';

const DAY = '2026-11-19';

function pagesFor(commitments: Commitment[], travel: Record<string, number> = { d: 15 }) {
  return planDays({ commitments, places: PLACES, settings: settings(), travelMinutes: travel, dayKeys: [DAY] }).pages;
}

const dentist = appt({ id: 'd', start: at(DAY, 10, 30), prepMinutes: 20 });

describe('remote schedule sync', () => {
  it('schedules every future beep of every loud page once, and nothing again for an unchanged plan', () => {
    const pages = pagesFor([dentist]);
    const first = diffSchedules({}, pages, {}, at(DAY, 8, 0));
    // Leave 10:10 (15 travel + 5 buffer), get ready 9:40 (20 x 1.5); each with repeats at +3, +6, +10.
    expect(first.create.map((a) => a.id)).toEqual([
      'd:get-ready#0', 'd:get-ready#1', 'd:get-ready#2', 'd:get-ready#3',
      'd:leave-now#0', 'd:leave-now#1', 'd:leave-now#2', 'd:leave-now#3',
    ]);
    expect(first.create[4]!.at).toBe(at(DAY, 10, 10));
    expect(first.withdraw).toEqual([]);

    const again = diffSchedules(first.next, pages, {}, at(DAY, 9, 45));
    expect(again).toMatchObject({ withdraw: [], create: [] });
  });

  it('withdraws and reschedules a page whose time moved, sending only future beeps', () => {
    const before = diffSchedules({}, pagesFor([dentist]), {}, at(DAY, 8, 0));
    const slower = diffSchedules(before.next, pagesFor([dentist], { d: 25 }), {}, at(DAY, 9, 45));
    expect(slower.withdraw).toEqual(['d:get-ready', 'd:leave-now']);
    // Get ready moved to 9:30 (last repeat 9:40), so at 9:45 it is all past:
    // its old 9:40-9:50 schedules are withdrawn and nothing replaces them.
    expect(slower.create.map((a) => a.id)).toEqual(['d:leave-now#0', 'd:leave-now#1', 'd:leave-now#2', 'd:leave-now#3']);
    expect(slower.create[0]!.at).toBe(at(DAY, 10, 0));
    expect(Object.keys(slower.next)).toEqual(['d:leave-now']);
  });

  it('never schedules acknowledged or silent pages, and withdraws pages that left the plan', () => {
    const lowGym = appt({ id: 'g', placeId: 'gym', priority: 'low', start: at(DAY, 18, 0) });
    const sent = diffSchedules({}, pagesFor([dentist, lowGym]), { 'd:get-ready': at(DAY, 8, 30) }, at(DAY, 8, 0));
    expect(new Set(sent.create.map((a) => a.pageId))).toEqual(new Set(['d:leave-now']));
    expect(sent.create.every((a) => !a.silent)).toBe(true);

    const removed = diffSchedules(sent.next, pagesFor([lowGym]), {}, at(DAY, 9, 0));
    expect(removed.withdraw).toEqual(['d:leave-now']);
    expect(removed.create).toEqual([]);
  });

  it('the relay channel posts the beeps to /schedule and does not send them again from the open app', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ch = new RelaySmsChannel('https://relay.example.com/', 'token', fetchImpl as unknown as typeof fetch);
    const { create } = diffSchedules({}, pagesFor([dentist]), { 'd:get-ready': 1 }, at(DAY, 8, 0));
    expect(await ch.schedule(create)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/schedule');
    const body = JSON.parse(init.body as string) as { to?: string; alerts: { id: string; at: number }[] };
    expect(body.to).toBeUndefined();
    expect(body.alerts.map((a) => a.id)).toEqual(['d:leave-now#0', 'd:leave-now#1', 'd:leave-now#2', 'd:leave-now#3']);
    expect(body.alerts[0]!.at).toBe(at(DAY, 10, 10));

    const receipt = await ch.deliver(create[0]!);
    expect(receipt.detail).toBe('sent by the relay schedule');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // After ACK the page is no longer scheduled, so a later re-plan could send it directly.
    await ch.withdraw('d:leave-now');
    await ch.deliver(create[0]!);
    expect(fetchImpl.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      'https://relay.example.com/schedule',
      'https://relay.example.com/ack',
      'https://relay.example.com/page',
    ]);
  });

  it('an escalation page makes no relay call and is never scheduled (Req 12.4, 12.5)', async () => {
    const must = appt({ id: 'd', start: at(DAY, 10, 30), prepMinutes: 20, priority: 'must' });
    const on = planDays({
      commitments: [must],
      places: PLACES,
      settings: settings({ onCall: { enabled: true, name: 'Sam' } }),
      travelMinutes: { d: 15 },
      dayKeys: [DAY],
    }).pages;
    const escalation = on.filter((p) => p.kind === 'escalation');
    expect(escalation).toHaveLength(1);

    const diff = diffSchedules({}, escalation, {}, at(DAY, 8, 0));
    expect(diff.create).toEqual([]);
    expect(diff.next).toEqual({});
    const full = diffSchedules({}, on, {}, at(DAY, 8, 0));
    expect(full.create.some((a) => a.pageId.endsWith(':escalate'))).toBe(false);

    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ch = new RelaySmsChannel('https://relay.example.com', 'token', fetchImpl as unknown as typeof fetch);
    const alerts = alertsForPage(escalation[0]!, undefined, Number.POSITIVE_INFINITY);
    expect(alerts.length).toBeGreaterThan(0);
    expect(await ch.schedule(alerts)).toBe(true);
    for (const a of alerts) expect((await ch.deliver(a)).delivered).toBe(false);
    await ch.withdraw(escalation[0]!.id);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
