import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineViolations } from '../../scripts/hooks/engine-rules.mjs';
import { alertsUpTo, nextAlertAt, pageStatus } from '../../src/engine/alerts';
import {
  ESCALATION_GRACE_MIN,
  escalationFor,
  escalationId,
  escalationInstant,
  escalationStatus,
  escalationText,
  isCancelled,
  isEligible,
  lastBeepAt,
  MAX_ESCALATION_TEXT,
  normalizeSecondaryName,
  onCallName,
  pickEligible,
  readOnCall,
} from '../../src/engine/escalate';
import { planDays, type PlanInput } from '../../src/engine/plan';
import { sampleDay, SAMPLE_ON_CALL, SAMPLE_PLACES } from '../../src/engine/sample';
import { addDays, lcdClock } from '../../src/engine/time';
import { straightLineMinutes } from '../../src/engine/travel';
import type { Commitment, PlannedPage, Settings } from '../../src/engine/types';
import { appt, at, M, settings, TZ } from './helpers';

const DAY = '2026-11-19';
const NEXT = addDays(DAY, 1);
const sample = sampleDay(DAY, TZ);
const byId = new Map(sample.map((c) => [c.id, c]));

const onSettings = (o: Partial<Settings> = {}) => settings({ onCall: SAMPLE_ON_CALL, ...o });
const home = SAMPLE_PLACES.find((p) => p.id === 'home')!.point!;
/** Straight-line car minutes from home, as the local travel adapter gives them. */
const travelMinutes = Object.fromEntries(
  sample.flatMap((c) => {
    const point = SAMPLE_PLACES.find((p) => p.id === c.placeId)?.point;
    return point ? [[c.id, straightLineMinutes(home, point, 'car')]] : [];
  }),
);
function planOf(commitments: Commitment[], s: Settings, pinned: string[] = [], dayKeys = [DAY, NEXT]) {
  const input: PlanInput = { commitments, places: SAMPLE_PLACES, settings: s, travelMinutes, dayKeys, pinnedPageIds: pinned };
  return planDays(input);
}

const off = planOf(sample, settings());
const on = planOf(sample, onSettings());
const onDay = on.days[0]!;
const pageOf = (id: string) => onDay.pages.find((p) => p.id === id)!;
const leave = pageOf('sample-dentist:leave-now');
const esc = pageOf('sample-dentist:escalate');

describe('secondary name (Req 1.2-1.6)', () => {
  it('trims and collapses spaces and tabs (Req 1.3)', () => {
    expect(normalizeSecondaryName('  Sam  ')).toEqual({ ok: true, name: 'Sam' });
    expect(normalizeSecondaryName('Sam \t  Lee')).toEqual({ ok: true, name: 'Sam Lee' });
  });
  it('refuses an empty name (Req 1.4)', () => {
    expect(normalizeSecondaryName('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeSecondaryName(' \t ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('accepts 24 characters and refuses 25 (Req 1.5)', () => {
    expect(normalizeSecondaryName('a'.repeat(24)).ok).toBe(true);
    expect(normalizeSecondaryName('a'.repeat(25))).toEqual({ ok: false, reason: 'too-long' });
    expect(normalizeSecondaryName(`  ${'a'.repeat(24)}  `).ok).toBe(true);
  });
  it('refuses control characters such as a newline (Req 1.6)', () => {
    expect(normalizeSecondaryName('Sam\nLee')).toEqual({ ok: false, reason: 'control-characters' });
    expect(normalizeSecondaryName('Sam\u0000')).toEqual({ ok: false, reason: 'control-characters' });
    expect(normalizeSecondaryName('Sam\u007f')).toEqual({ ok: false, reason: 'control-characters' });
  });
  it('counts an emoji as one character (Req 1.5)', () => {
    expect(normalizeSecondaryName('\u{1F987}'.repeat(24)).ok).toBe(true);
    expect(normalizeSecondaryName('\u{1F987}'.repeat(25)).ok).toBe(false);
  });
});

describe('stored on-call setting (Req 1.2, 1.9)', () => {
  it('returns a valid setting, cleaned (Req 1.2)', () => {
    expect(readOnCall({ enabled: true, name: ' Sam ' })).toEqual({ enabled: true, name: 'Sam' });
    expect(readOnCall({ enabled: false, name: 'Sam' })).toEqual({ enabled: false, name: 'Sam' });
  });
  it('gives null for a malformed value (Req 1.9)', () => {
    for (const bad of [undefined, null, 'Sam', 7, [], {}, { enabled: 'yes', name: 'Sam' }, { enabled: true, name: 5 }, { enabled: true, name: '' }, { enabled: true, name: 'x'.repeat(30) }]) {
      expect(readOnCall(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it('onCallName is the name only while enabled and valid (Req 1.1, 1.9)', () => {
    expect(onCallName(onSettings())).toBe('Sam');
    expect(onCallName(settings())).toBeNull();
    expect(onCallName(settings({ onCall: { enabled: false, name: 'Sam' } }))).toBeNull();
    expect(onCallName(settings({ onCall: { enabled: true, name: 7 } as never }))).toBeNull();
  });
});

describe('eligibility (Req 2.1-2.3)', () => {
  const eligible = (p: PlannedPage) => isEligible(p, p.commitmentId ? byId.get(p.commitmentId) : undefined);

  it('only a must leave-now page is eligible (Req 2.1)', () => {
    expect(eligible(pageOf('sample-dentist:leave-now'))).toBe(true);
    expect(eligible(pageOf('sample-pickup:leave-now'))).toBe(true);
  });
  it('a get-ready page is not (Req 2.2)', () => {
    expect(eligible(pageOf('sample-dentist:get-ready'))).toBe(false);
  });
  it('a focus-start page is not, even for a must focus block (Req 2.2)', () => {
    const c = appt({ id: 'deep', kind: 'focus', placeId: null, start: at(DAY, 13), priority: 'must' });
    const p = planOf([c], settings()).days[0]!.pages.find((x) => x.kind === 'focus-start')!;
    expect(isEligible(p, c)).toBe(false);
    expect(eligible(off.days[0]!.pages.find((p) => p.id === 'sample-taxes:focus-start')!)).toBe(false);
  });
  it('a digest page is not (Req 2.2)', () => {
    expect(eligible(onDay.pages.find((p) => p.kind === 'digest')!)).toBe(false);
  });
  it('a normal leave-now page is not (Req 2.3)', () => {
    expect(eligible(pageOf('sample-dinner:leave-now'))).toBe(false);
    expect(eligible(pageOf('sample-standup:leave-now'))).toBe(false);
  });
  it('a low commitment never has a page to escalate (Req 2.3)', () => {
    const low = appt({ id: 'low', start: at(DAY, 16), priority: 'low' });
    expect(planOf([low], onSettings()).pages.filter((p) => p.kind === 'escalation')).toEqual([]);
  });
});

describe('escalation instant (Req 2.5, 3.1, 3.2, 3.5, 3.6)', () => {
  it('is the last beep plus the grace minute: 10:19 for the sample dentist (Req 3.1)', () => {
    expect(lastBeepAt(leave)).toBe(leave.escalateAt[leave.escalateAt.length - 1]);
    expect(escalationInstant(leave)).toBe(lastBeepAt(leave) + ESCALATION_GRACE_MIN * M);
    expect(travelMinutes['sample-dentist']).toBe(17);
    expect(leave.fireAt).toBe(at(DAY, 10, 8));
    expect(leave.escalateAt).toEqual([at(DAY, 10, 11), at(DAY, 10, 14), at(DAY, 10, 18)]);
    expect(esc.fireAt).toBe(at(DAY, 10, 19));
    expect(esc.cutoffAt).toBe(leave.cutoffAt);
    expect(esc.cutoffAt).toBe(at(DAY, 10, 30));
  });
  it('moves with the offsets (Req 3.2)', () => {
    const p = planOf(sample, onSettings({ escalationMinutes: [2, 4] })).days[0]!.pages.find((x) => x.id === 'sample-dentist:escalate')!;
    expect(p.fireAt).toBe(leave.fireAt + 5 * M);
    expect(p.fireAt).not.toBe(esc.fireAt);
  });
  it('a page with no repeats uses its first beep (Req 3.1)', () => {
    const call = appt({ id: 'call', placeId: 'online', prepMinutes: 0, start: at(DAY, 16), priority: 'must' });
    const p = planOf([call], onSettings({ bufferMinutes: 0 })).pages;
    const l = p.find((x) => x.kind === 'leave-now')!;
    expect(l.escalateAt).toEqual([]);
    expect(lastBeepAt(l)).toBe(l.fireAt);
    expect(p.find((x) => x.kind === 'escalation')?.fireAt).toBe(l.fireAt + M);
  });
  it('is refused when the instant is not before the cutoff (Req 2.5)', () => {
    // A 4-minute lead: the first repeat lands one minute before the start, so the instant is the start.
    const tight = appt({ id: 'tight', placeId: 'online', prepMinutes: 0, start: at(DAY, 16), priority: 'must' });
    const pages = planOf([tight], onSettings({ bufferMinutes: 4 })).pages;
    const l = pages.find((x) => x.kind === 'leave-now')!;
    expect(escalationInstant(l)).toBe(l.cutoffAt);
    expect(escalationFor(l, tight, 'Sam', TZ)).toBeNull();
    expect(pages.some((x) => x.kind === 'escalation')).toBe(false);
    expect(pickEligible(pages, new Map([[tight.id, tight]]), onSettings(), new Set())).toBeNull();
  });
  it('takes the cutoff of its leave-now page, the start (Req 3.5)', () => {
    expect(esc.cutoffAt).toBe(sample.find((c) => c.id === 'sample-dentist')!.start);
  });
  it('stays one elapsed minute after the last beep across the November fall-back (Req 3.6)', () => {
    const start = Date.UTC(2026, 10, 1, 7, 30);
    const c = appt({ id: 'dst', placeId: null, prepMinutes: 0, start, priority: 'must' });
    const p = planOf([c], onSettings({ bufferMinutes: 41 }), [], ['2026-11-01']).pages;
    const l = p.find((x) => x.kind === 'leave-now')!;
    const e = p.find((x) => x.kind === 'escalation')!;
    expect(lastBeepAt(l)).toBe(Date.UTC(2026, 10, 1, 6, 59));
    expect(e.fireAt - lastBeepAt(l)).toBe(M);
    // The wall clock repeats an hour here: 1:59A is followed by 1:00A.
    expect(lcdClock(lastBeepAt(l), TZ)).toBe('1:59A');
    expect(lcdClock(e.fireAt, TZ)).toBe('1:00A');
  });
});

describe('escalation message (Req 4.2, 4.3)', () => {
  it('words a LEAVE page in upper case with the LCD clock (Req 4.2)', () => {
    expect(esc.text).toBe('SAM: OWNER MISSED 911, LEAVE FOR DENTIST CLEANING. STARTS 10:30A');
    expect(esc.code).toBe('999');
    expect(esc.secondaryName).toBe('Sam');
    expect(esc.dependsOn).toBe('sample-dentist:leave-now');
  });
  it('words a JOIN page with JOIN (Req 4.2)', () => {
    const standup = byId.get('sample-standup')!;
    const text = escalationText('Sam', pageOf('sample-standup:leave-now'), standup, TZ);
    expect(text).toBe('SAM: OWNER MISSED 911, JOIN FOR TEAM STAND-UP. STARTS 9:30A');
  });
  it('shortens a long title, keeping the verb and the time (Req 4.3)', () => {
    const c = { ...byId.get('sample-dentist')!, title: 'Annual dental cleaning and a very long consultation about everything '.repeat(4) };
    const text = escalationText('Sam', leave, c, TZ);
    expect(text.length).toBeLessThanOrEqual(MAX_ESCALATION_TEXT);
    expect(text).toMatch(/^SAM: OWNER MISSED 911, LEAVE FOR ANNUAL.*\.\.\.\. STARTS 10:30A$/);
    expect(text.endsWith('STARTS 10:30A')).toBe(true);
  });
  it('leaves a title of ordinary length whole (Req 4.3)', () => {
    expect(esc.text.length).toBeLessThan(MAX_ESCALATION_TEXT);
    expect(esc.text).not.toContain('...');
  });
});

describe('cancellation and status (Req 3.3, 3.4, 6.1-6.3, 6.7)', () => {
  const pages = [leave, esc];
  const id = leave.id;

  it('an ACK before the instant cancels it (Req 6.1)', () => {
    const acks = { [id]: at(DAY, 10, 16) };
    expect(isCancelled(esc, acks)).toBe(true);
    expect(alertsUpTo(pages, acks, esc.cutoffAt).filter((a) => a.pageId === esc.id)).toEqual([]);
  });
  it('an ACK exactly at the instant cancels it (Req 6.1)', () => {
    const acks = { [id]: esc.fireAt };
    expect(isCancelled(esc, acks)).toBe(true);
    expect(alertsUpTo(pages, acks, esc.cutoffAt).filter((a) => a.pageId === esc.id)).toEqual([]);
  });
  it('an ACK one minute after leaves the page and its single alert (Req 6.3)', () => {
    const acks = { [id]: esc.fireAt + M };
    expect(isCancelled(esc, acks)).toBe(false);
    const alerts = alertsUpTo(pages, acks, esc.cutoffAt).filter((a) => a.pageId === esc.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.at).toBe(esc.fireAt);
  });
  it('an unanswered page beeps once at 10:19 and never repeats (Req 3.3, 3.4)', () => {
    expect(esc.escalateAt).toEqual([]);
    const alerts = alertsUpTo(pages, {}, esc.cutoffAt + 60 * M).filter((a) => a.pageId === esc.id);
    expect(alerts.map((a) => a.at)).toEqual([at(DAY, 10, 19)]);
    expect(alerts[0]?.code).toBe('999');
  });
  it('is missed at 10:30 and cancelled, not missed, after an ACK in time (Req 6.2, 6.7)', () => {
    expect(escalationStatus(esc, {}, at(DAY, 10, 10))).toBe('scheduled');
    expect(escalationStatus(esc, {}, at(DAY, 10, 25))).toBe('paging');
    expect(escalationStatus(esc, {}, at(DAY, 10, 30))).toBe('missed');
    expect(escalationStatus(esc, { [id]: at(DAY, 10, 16) }, at(DAY, 10, 40))).toBe('cancelled');
    expect(escalationStatus(esc, { [esc.id]: at(DAY, 10, 22) }, at(DAY, 10, 40))).toBe('acked');
  });
  it('nextAlertAt skips a cancelled page (Req 3.3, 6.1)', () => {
    expect(nextAlertAt(pages, {}, at(DAY, 10, 18))).toBe(esc.fireAt);
    expect(nextAlertAt(pages, { [id]: at(DAY, 10, 10) }, at(DAY, 10, 10))).toBeNull();
  });
  it('a page without dependsOn is never cancelled (Req 6.1)', () => {
    expect(isCancelled(leave, { [id]: leave.fireAt })).toBe(false);
  });
  it('pageStatus of the 911 is unchanged by the escalation (Req 6.5)', () => {
    expect(pageStatus(leave, {}, at(DAY, 10, 25))).toBe('paging');
  });
});

describe('planner (Req 1.1, 1.7, 2.4, 2.6, 5.1-5.8)', () => {
  const idsOf = (d: { pages: PlannedPage[] }) => d.pages.filter((p) => p.countsToBudget && !p.silent).map((p) => p.id);

  it('off gives the existing six pages and a digest (Req 1.1, 2.6)', () => {
    const d = off.days[0]!;
    expect(d.pages.filter((p) => p.countsToBudget && !p.silent).map((p) => p.id)).toEqual([
      'sample-dentist:get-ready',
      'sample-dentist:leave-now',
      'sample-standup:leave-now',
      'sample-taxes:focus-start',
      'sample-pickup:leave-now',
      'sample-dinner:leave-now',
    ].sort((a, b) => d.pages.find((p) => p.id === a)!.fireAt - d.pages.find((p) => p.id === b)!.fireAt || a.localeCompare(b)));
    expect(d.budget).toEqual({ limit: 6, used: 6 });
    expect(d.digest.some((i) => i.reason === 'over-budget' && i.title === "Dinner at Morgan's")).toBe(true);
  });
  it('a disabled or removed setting plans exactly the same (Req 1.7, 2.6)', () => {
    const disabled = planOf(sample, settings({ onCall: { enabled: false, name: 'Sam' } }));
    expect(disabled).toEqual(off);
    expect(on.pages.some((p) => p.kind === 'escalation')).toBe(true);
    expect(off.pages.some((p) => p.kind === 'escalation')).toBe(false);
  });
  it('on: the reservation pushes taxes and the dinner get-ready into the digest, used 6 of 6 (Req 5.1, 5.2, 5.6, 5.8)', () => {
    expect(new Set(idsOf(onDay))).toEqual(
      new Set([
        'sample-dentist:leave-now',
        'sample-pickup:leave-now',
        'sample-dentist:get-ready',
        'sample-standup:leave-now',
        'sample-dinner:leave-now',
        'sample-dentist:escalate',
      ]),
    );
    const over = onDay.digest.filter((i) => i.reason === 'over-budget').map((i) => `${i.commitmentId}:${i.kind}`);
    expect(over).toEqual(expect.arrayContaining(['sample-taxes:focus-start', 'sample-dinner:get-ready']));
    expect(over).toHaveLength(2);
    expect(onDay.budget).toEqual({ limit: 6, used: 6 });
    expect(onDay.pages.filter((p) => p.countsToBudget && !p.silent)).toHaveLength(6);
  });
  it('the escalation page takes its leave-now page day key and the budget flags (Req 5.1, 5.8)', () => {
    expect(esc.dayKey).toBe(leave.dayKey);
    expect(esc.countsToBudget).toBe(true);
    expect(esc.silent).toBe(false);
    expect(esc.escalateAt).toEqual([]);
  });
  it('a budget of 1 gives no escalation (Req 5.4)', () => {
    const p = planOf(sample, onSettings({ dailyBudget: 1 }));
    expect(p.pages.some((x) => x.kind === 'escalation')).toBe(false);
    expect(p.days[0]!.budget.used).toBe(1);
  });
  it('a budget of 2 keeps the must 911 and its escalation (Req 5.3, 5.4)', () => {
    const d = planOf(sample, onSettings({ dailyBudget: 2 })).days[0]!;
    expect(idsOf(d).sort()).toEqual(['sample-dentist:escalate', 'sample-dentist:leave-now']);
    expect(d.budget.used).toBe(2);
  });
  it('an eligible page that does not fit releases the slot (Req 5.5)', () => {
    // Two pinned pages outrank the dentist; with a budget of 2 only one fits after the reservation.
    const pinned = ['sample-standup:leave-now', 'sample-dinner:leave-now'];
    const d = planOf(sample, onSettings({ dailyBudget: 2 }), pinned).days[0]!;
    expect(d.pages.some((p) => p.kind === 'escalation')).toBe(false);
    expect(idsOf(d).sort()).toEqual([...pinned].sort());
    expect(d.budget.used).toBe(2);
  });
  it('two eligible pages in a day escalate only the first (Req 2.4)', () => {
    expect(onDay.pages.filter((p) => p.kind === 'escalation').map((p) => p.id)).toEqual(['sample-dentist:escalate']);
    expect(pageOf('sample-pickup:leave-now')).toBeDefined();
  });
  it('a pinned escalation keeps its slot on a re-plan (Req 5.7)', () => {
    const pinnedPlan = planOf(sample, onSettings(), [escalationId(pageOf('sample-pickup:leave-now'))]).days[0]!;
    expect(pinnedPlan.pages.filter((p) => p.kind === 'escalation').map((p) => p.id)).toEqual(['sample-pickup:escalate']);
    expect(pinnedPlan.budget.used).toBe(6);
  });
  it('pickEligible is null while escalation is off (Req 1.1)', () => {
    expect(pickEligible(onDay.pages, byId, settings(), new Set())).toBeNull();
    expect(pickEligible(onDay.pages, byId, onSettings(), new Set())?.id).toBe('sample-dentist:leave-now');
  });
  it('the plan is the same however the commitments are ordered (Req 12.2)', () => {
    expect(planOf([...sample].reverse(), onSettings())).toEqual(on);
  });
});

describe('purity and determinism (Req 12.1-12.3)', () => {
  it('escalate.ts is scanned by the purity test and has no violations (Req 12.3)', () => {
    const source = readFileSync(join(import.meta.dirname, '../../src/engine/escalate.ts'), 'utf8');
    expect(engineViolations(source)).toEqual([]);
  });
  it('planning twice gives the same plan (Req 12.1)', () => {
    expect(planOf(sample, onSettings())).toEqual(planOf(sample, onSettings()));
  });
  it('planning in reversed order gives the same escalation pages (Req 12.2)', () => {
    const reversed = planOf([...sample].reverse(), onSettings());
    expect(reversed.pages.filter((p) => p.kind === 'escalation')).toEqual(on.pages.filter((p) => p.kind === 'escalation'));
  });
});
