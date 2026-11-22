import { CODE_FOR } from './codes';
import { lcdClock, MINUTE } from './time';
import type { Commitment, EscalationStatus, OnCallSettings, PlannedPage, Settings } from './types';

/**
 * On-call escalation: when a must-go leave-now page is still unanswered after
 * its last repeat, a second, on-screen pager pages the user's secondary. Pure:
 * nothing here reads the clock or performs I/O, and nothing is sent anywhere.
 */

export type { EscalationStatus } from './types';

/** Acknowledgement time per page id (the same shape as `Acks` in alerts.ts). */
type AckTimes = Readonly<Record<string, number>>;

/** The user gets this long after the last beep before the secondary is paged. */
export const ESCALATION_GRACE_MIN = 1;
export const MAX_SECONDARY_NAME = 24;
export const MAX_ESCALATION_TEXT = 120;
export const MAX_ESCALATIONS_PER_DAY = 1;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: 'empty' | 'too-long' | 'control-characters' };

/** Spaces and tabs are whitespace; every other control character (a newline, for one) is refused. */
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/u;
const WHITESPACE_RUN = /[\p{Zs}\t]+/gu;

/** Trim, collapse inner whitespace to one space, then refuse empty, long or control-character names. */
export function normalizeSecondaryName(raw: string): NameCheck {
  if (CONTROL.test(raw)) return { ok: false, reason: 'control-characters' };
  const name = raw.replace(WHITESPACE_RUN, ' ').trim();
  if (name.length === 0) return { ok: false, reason: 'empty' };
  if ([...name].length > MAX_SECONDARY_NAME) return { ok: false, reason: 'too-long' };
  return { ok: true, name };
}

/** A stored on-call setting, cleaned; null (treated as off) when it is malformed. */
export function readOnCall(value: unknown): OnCallSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean' || typeof v.name !== 'string') return null;
  const check = normalizeSecondaryName(v.name);
  return check.ok ? { enabled: v.enabled, name: check.name } : null;
}

/** The secondary's name while escalation is on and valid, else null. */
export function onCallName(settings: Settings): string | null {
  const s = readOnCall(settings.onCall);
  return s && s.enabled ? s.name : null;
}

export function isEscalation(p: PlannedPage): boolean {
  return p.kind === 'escalation';
}

export function escalationId(leaveNow: PlannedPage): string {
  return `${leaveNow.commitmentId ?? 'none'}:escalate`;
}

/** The final beep of a page: its last repeat, or its first beep when it has none. */
export function lastBeepAt(p: PlannedPage): number {
  return p.escalateAt.reduce((latest, t) => Math.max(latest, t), p.fireAt);
}

export function escalationInstant(p: PlannedPage): number {
  return lastBeepAt(p) + ESCALATION_GRACE_MIN * MINUTE;
}

/** Only the leave-now page of a must commitment escalates. */
export function isEligible(p: PlannedPage, c: Commitment | undefined): boolean {
  return p.kind === 'leave-now' && !p.silent && c !== undefined && c.priority === 'must';
}

/**
 * The one page of a day that gets an escalation: a page whose escalation has
 * already beeped (pinned) first, then the earliest. Null while escalation is off.
 */
export function pickEligible(
  day: readonly PlannedPage[],
  commitments: ReadonlyMap<string, Commitment>,
  settings: Settings,
  pinned: ReadonlySet<string>,
): PlannedPage | null {
  if (onCallName(settings) === null) return null;
  const candidates = day
    .filter((p) => isEligible(p, p.commitmentId ? commitments.get(p.commitmentId) : undefined) && escalationInstant(p) < p.cutoffAt)
    .sort(
      (a, b) =>
        Number(pinned.has(escalationId(b))) - Number(pinned.has(escalationId(a))) || a.fireAt - b.fireAt || a.id.localeCompare(b.id),
    );
  return candidates.slice(0, MAX_ESCALATIONS_PER_DAY)[0] ?? null;
}

/** `SAM: OWNER MISSED 911, LEAVE FOR DENTIST. STARTS 10:30A`, with a long title cut short. */
export function escalationText(name: string, p: PlannedPage, c: Commitment, timeZone: string): string {
  const verb = /^(\w+) NOW:/.exec(p.text)?.[1] ?? 'LEAVE';
  const head = `${name.toUpperCase()}: OWNER MISSED ${CODE_FOR['leave-now']}, ${verb} FOR `;
  const tail = `. STARTS ${lcdClock(c.start, timeZone)}`;
  let title = c.title.trim().toUpperCase();
  const room = MAX_ESCALATION_TEXT - head.length - tail.length;
  if (title.length > room) title = `${title.slice(0, Math.max(0, room - 3)).trimEnd()}...`;
  return `${head}${title}${tail}`;
}

/** The escalation page for an eligible leave-now page, or null when there is no room before its cutoff. */
export function escalationFor(p: PlannedPage, c: Commitment, name: string, timeZone: string): PlannedPage | null {
  const fireAt = escalationInstant(p);
  if (fireAt >= p.cutoffAt) return null;
  return {
    id: escalationId(p),
    commitmentId: p.commitmentId,
    kind: 'escalation',
    code: CODE_FOR.escalation,
    text: escalationText(name, p, c, timeZone),
    fireAt,
    escalateAt: [],
    cutoffAt: p.cutoffAt,
    silent: false,
    countsToBudget: true,
    priority: 'must',
    dayKey: p.dayKey,
    dependsOn: p.id,
    secondaryName: name,
  };
}

/** True when the user answered the leave-now page at or before the escalation instant. */
export function isCancelled(p: PlannedPage, acks: AckTimes): boolean {
  if (p.dependsOn === undefined) return false;
  const ackAt = acks[p.dependsOn];
  return ackAt !== undefined && ackAt <= p.fireAt;
}

/** Like `pageStatus`, plus `cancelled`. */
export function escalationStatus(p: PlannedPage, acks: AckTimes, now: number): EscalationStatus {
  if (isCancelled(p, acks)) return 'cancelled';
  if (acks[p.id] !== undefined) return 'acked';
  if (now < p.fireAt) return 'scheduled';
  if (now >= p.cutoffAt) return 'missed';
  return 'paging';
}

/** Splits a plan's pages between the user's pager and the secondary's. */
export function splitByPager(pages: readonly PlannedPage[]): { primary: PlannedPage[]; secondary: PlannedPage[] } {
  return { primary: pages.filter((p) => !isEscalation(p)), secondary: pages.filter(isEscalation) };
}
