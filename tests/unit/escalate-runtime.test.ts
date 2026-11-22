import { describe, expect, it } from 'vitest';
import { alertsUpTo, pageStatus } from '../../src/engine/alerts';
import { escalationId, escalationStatus, isCancelled, isEscalation, splitByPager } from '../../src/engine/escalate';
import { ignoreReplay, pickIgnoreTarget, rebookPage } from '../../src/engine/haunt';
import { planDays } from '../../src/engine/plan';
import { dayReport, dayReportLine, haunting } from '../../src/engine/report';
import { acknowledge, activePages, emptyRuntimeState, pinnedPageIds, rewind, tick } from '../../src/engine/runtime';
import { sampleDay, SAMPLE_ON_CALL, SAMPLE_PLACES } from '../../src/engine/sample';
import { addDays } from '../../src/engine/time';
import { straightLineMinutes } from '../../src/engine/travel';
import { at, settings, TZ } from './helpers';

const DAY = '2026-11-19';
const NEXT = addDays(DAY, 1);
const commitments = sampleDay(DAY, TZ);
const home = SAMPLE_PLACES.find((p) => p.id === 'home')!.point!;
const travelMinutes = Object.fromEntries(
  commitments.flatMap((c) => {
    const point = SAMPLE_PLACES.find((p) => p.id === c.placeId)?.point;
    return point ? [[c.id, straightLineMinutes(home, point, 'car')]] : [];
  }),
);
const plan = (s = settings({ onCall: SAMPLE_ON_CALL }), pinned: string[] = []) =>
  planDays({ commitments, places: SAMPLE_PLACES, settings: s, travelMinutes, dayKeys: [DAY, NEXT], pinnedPageIds: pinned });

const on = plan();
const day = on.days[0]!;
const leave = day.pages.find((p) => p.id === 'sample-dentist:leave-now')!;
const esc = day.pages.find((p) => p.id === 'sample-dentist:escalate')!;

describe('runtime with an escalation page (Req 6.4-6.6, 6.8, 6.9)', () => {
  it('splits the pages between the two pagers (Req 6.4)', () => {
    const { primary, secondary } = splitByPager(on.pages);
    expect(secondary.map((p) => p.id)).toEqual(['sample-dentist:escalate']);
    expect(primary.some(isEscalation)).toBe(false);
    expect(primary.length + secondary.length).toBe(on.pages.length);
  });

  it('records the secondary ACK under the escalation id and leaves the 911 alone (Req 6.4, 6.5)', () => {
    const state = acknowledge(emptyRuntimeState(), escalationId(leave), at(DAY, 10, 21));
    expect(state.acks).toEqual({ 'sample-dentist:escalate': at(DAY, 10, 21) });
    expect(pageStatus(leave, state.acks, at(DAY, 10, 25))).toBe('paging');
    expect(escalationStatus(esc, state.acks, at(DAY, 10, 25))).toBe('acked');
  });

  it('an ACK of the 911 after the instant leaves the escalation unacknowledged (Req 6.3, 6.6)', () => {
    const state = acknowledge(emptyRuntimeState(), leave.id, at(DAY, 10, 25));
    expect(state.acks[esc.id]).toBeUndefined();
    expect(isCancelled(esc, state.acks)).toBe(false);
    expect(escalationStatus(esc, state.acks, at(DAY, 10, 25))).toBe('paging');
    expect(activePages(on.pages, tick(on.pages, emptyRuntimeState(), at(DAY, 10, 19)).state, at(DAY, 10, 19)).map((p) => p.id)).toContain(esc.id);
  });

  it('delivers the escalation alert once (Req 6.9)', () => {
    const first = tick(on.pages, emptyRuntimeState(), at(DAY, 10, 19));
    expect(first.fresh.map((a) => a.pageId)).toContain(esc.id);
    expect(first.fresh.find((a) => a.pageId === esc.id)?.code).toBe('999');
    const second = tick(on.pages, first.state, at(DAY, 10, 22));
    expect([...second.fresh, ...second.stale].some((a) => a.pageId === esc.id)).toBe(false);
  });

  it('a page that went moot while the app was closed is stale and silent (Req 6.8)', () => {
    const result = tick(on.pages, emptyRuntimeState(), at(DAY, 10, 40));
    expect(result.fresh.some((a) => a.pageId === esc.id)).toBe(false);
    expect(result.stale.map((a) => a.id)).toContain('sample-dentist:escalate#0');
  });

  it('an answered 911 means a cancelled escalation never reaches the pager, even when the app wakes late (Req 6.1, 6.8)', () => {
    const state = acknowledge(emptyRuntimeState(), leave.id, at(DAY, 10, 16));
    const result = tick(on.pages, state, at(DAY, 10, 25));
    expect([...result.fresh, ...result.stale].some((a) => a.pageId === esc.id)).toBe(false);
  });

  it('pinnedPageIds names a delivered escalation, so a re-plan keeps its slot (Req 5.7, 6.9)', () => {
    const state = tick(on.pages, emptyRuntimeState(), at(DAY, 10, 19)).state;
    expect(pinnedPageIds(state)).toContain(esc.id);
    const replanned = plan(settings({ onCall: SAMPLE_ON_CALL }), pinnedPageIds(state));
    expect(replanned.pages.find((p) => p.id === esc.id)).toEqual(esc);
  });

  it('rewinding to before the instant forgets its delivery (Req 6.9)', () => {
    const state = tick(on.pages, emptyRuntimeState(), at(DAY, 10, 19)).state;
    expect(state.delivered).toContain('sample-dentist:escalate#0');
    const back = rewind(on.pages, state, at(DAY, 10, 15));
    expect(back.delivered).not.toContain('sample-dentist:escalate#0');
    expect(tick(on.pages, back, at(DAY, 10, 19)).fresh.some((a) => a.pageId === esc.id)).toBe(true);
  });

  it('rewinding to before an early ACK of the 911 brings the escalation back (Req 6.1, 6.9)', () => {
    const state = acknowledge(emptyRuntimeState(), leave.id, at(DAY, 10, 16));
    const back = rewind(on.pages, state, at(DAY, 10, 12));
    expect(back.acks[leave.id]).toBeUndefined();
    expect(alertsUpTo(on.pages, back.acks, at(DAY, 10, 19)).some((a) => a.pageId === esc.id)).toBe(true);
  });
});

describe('replay, recap, rebook and receipt (Req 7.3-7.6, 8.1-8.5)', () => {
  it('never lets the replay choose an escalation page (Req 8.1)', () => {
    const target = pickIgnoreTarget(day, commitments)!;
    expect(target.id).toBe('sample-dentist:leave-now');
    expect(ignoreReplay(day, esc.id)).toBeNull();
    const onlyEscalation = { ...day, pages: [esc] };
    expect(pickIgnoreTarget(onlyEscalation, commitments)).toBeNull();
  });

  it('plays the repeats, then the secondary pager, then the 666 recap (Req 8.2)', () => {
    const { state, dayOverAt } = ignoreReplay(day, leave.id)!;
    const alerts = alertsUpTo(day.pages, state.acks, dayOverAt);
    const mine = alerts.filter((a) => a.pageId === leave.id);
    const secondary = alerts.filter((a) => a.pageId === esc.id);
    expect(mine.map((a) => a.code)).toEqual(['911', '911 911', '911 911 911', '911 911 911']);
    expect(secondary.map((a) => a.at)).toEqual([at(DAY, 10, 19)]);
    expect(Math.max(...mine.map((a) => a.at))).toBeLessThan(secondary[0]!.at);
    const recap = haunting(day, state.acks, dayOverAt)!;
    expect(recap.code).toBe('666');
    expect(secondary[0]!.at).toBeLessThan(recap.at);
    expect(recap.pageIds).toEqual([leave.id]);
  });

  it('answers the other pages, cancels their escalation pages and leaves the target page unanswered (Req 8.3)', () => {
    const withPickup = plan(settings({ onCall: SAMPLE_ON_CALL }), ['sample-pickup:escalate']).days[0]!;
    const pickupEsc = withPickup.pages.find((p) => p.id === 'sample-pickup:escalate')!;
    expect(pickupEsc).toBeDefined();
    const { state, dayOverAt } = ignoreReplay(withPickup, leave.id)!;
    expect(isCancelled(pickupEsc, state.acks)).toBe(true);
    expect(alertsUpTo(withPickup.pages, state.acks, dayOverAt).some((a) => a.pageId === pickupEsc.id)).toBe(false);
    expect(Object.keys(state.acks).some((id) => id.endsWith(':escalate'))).toBe(false);
    expect(state.acks[leave.id]).toBeUndefined();
  });

  it('counts every beep up to the end of the day as delivered (Req 8.4)', () => {
    const { state, dayOverAt } = ignoreReplay(day, leave.id)!;
    expect(state.delivered).toContain('sample-dentist:escalate#0');
    const result = tick(day.pages, state, dayOverAt);
    expect(result.fresh).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('with escalation off, the replay is the replay without the feature (Req 8.5)', () => {
    const offDay = plan(settings()).days[0]!;
    const disabledDay = plan(settings({ onCall: { enabled: false, name: 'Sam' } })).days[0]!;
    expect(ignoreReplay(disabledDay, leave.id)).toEqual(ignoreReplay(offDay, leave.id));
    const { state } = ignoreReplay(offDay, leave.id)!;
    expect(state.delivered.some((id) => id.includes(':escalate'))).toBe(false);
  });

  it('the receipt counts an unanswered escalation as a beep, not as missed, and names the secondary (Req 7.3-7.5)', () => {
    const { state, dayOverAt } = ignoreReplay(day, leave.id)!;
    const report = dayReport(day, state.acks, dayOverAt)!;
    expect(report.beeps).toBe(6);
    expect(report.missed).toBe(1);
    expect(report.escalated).toBe(1);
    expect(report.secondaryName).toBe('Sam');
    expect(dayReportLine(report)).toBe('That was your day: 6 beeps, 5 kept quiet in the digest, 1 missed, 1 escalated to Sam.');
  });

  it('a cancelled escalation is not a beep and adds nothing to the line (Req 7.3, 7.5)', () => {
    const { state, dayOverAt } = ignoreReplay(day, leave.id)!;
    const acks = { ...state.acks, [leave.id]: at(DAY, 10, 16) };
    const report = dayReport(day, acks, dayOverAt)!;
    expect(report.beeps).toBe(5);
    expect(report.missed).toBe(0);
    expect(report.escalated).toBe(0);
    expect(dayReportLine(report)).not.toContain('escalated');
    expect(haunting(day, acks, dayOverAt)).toBeNull();
  });

  it('with escalation off the receipt has no escalated count and the old line (Req 7.5)', () => {
    const offDay = plan(settings()).days[0]!;
    const { state, dayOverAt } = ignoreReplay(offDay, leave.id)!;
    const report = dayReport(offDay, state.acks, dayOverAt)!;
    expect(report.escalated).toBeUndefined();
    expect(report.secondaryName).toBeUndefined();
    expect(dayReportLine(report)).toBe(`That was your day: 6 beeps, ${report.keptQuiet} kept quiet in the digest, 1 missed.`);
  });

  it('leaves the escalation page out of the 666 recap and the rebook page (Req 7.4, 7.6)', () => {
    const { state, dayOverAt } = ignoreReplay(day, leave.id)!;
    const recap = haunting(day, state.acks, dayOverAt)!;
    expect(recap.pageIds).toEqual([leave.id]);
    expect(recap.text).toContain('1 SLIPPED TODAY');
    expect(recap.text).not.toContain('OWNER MISSED');
    const rebook = rebookPage(day, state, commitments, TZ, at(NEXT, 8))!;
    expect(rebook.commitmentIds).toEqual(['sample-dentist']);
    expect(rebook.text).toBe('666 YESTERDAY: DENTIST CLEANING. REBOOK?');
  });

  it('a day with only an unanswered escalation page misses nothing (Req 7.4, 7.6)', () => {
    // The user answered the 911 after the secondary was paged; the escalation page is unanswered.
    const { state, dayOverAt } = ignoreReplay(day, leave.id)!;
    const acks = { ...state.acks, [leave.id]: at(DAY, 10, 25) };
    expect(dayReport(day, acks, dayOverAt)?.missed).toBe(0);
    expect(haunting(day, acks, dayOverAt)).toBeNull();
    expect(rebookPage(day, { acks, delivered: state.delivered }, commitments, TZ, at(NEXT, 8))).toBeNull();
  });
});
