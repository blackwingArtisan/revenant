import { effectivePrepMinutes } from './plan';
import { MINUTE, parseDayKey, zonedToEpoch } from './time';
import type { Settings } from './types';

export interface BeforeAfterInput {
  /** Epoch ms of the appointment. */
  start: number;
  travelMinutes: number;
  /** Prep time as the person states it; the honesty factor turns it into the real time. */
  prepMinutes: number;
  /** How long before the start an ordinary calendar reminder fires. */
  phoneLeadMinutes: number;
  settings: Settings;
}

export interface BeforeAfter {
  /** The ordinary reminder: fires at a fixed lead before the start. */
  phoneAlertAt: number;
  phoneLeaveAt: number;
  phoneArriveAt: number;
  phoneLateMinutes: number;
  /** Revenant's pages for the same appointment. */
  readyAt: number;
  leaveAt: number;
  arriveAt: number;
  earlyMinutes: number;
}

/**
 * The same appointment with an ordinary reminder and with Revenant. With the
 * reminder, real prep (stated prep x the honesty factor) and travel only start
 * when it fires; Revenant pages get-ready and leave-now from the same numbers,
 * exactly as the planner does. Pure.
 */
export function beforeAfter(i: BeforeAfterInput): BeforeAfter {
  const prep = effectivePrepMinutes(i.prepMinutes, i.settings.honestyFactor) * MINUTE;
  const travel = Math.max(0, Math.round(i.travelMinutes)) * MINUTE;
  const phoneAlertAt = i.start - i.phoneLeadMinutes * MINUTE;
  const phoneLeaveAt = phoneAlertAt + prep;
  const phoneArriveAt = phoneLeaveAt + travel;
  const leaveAt = i.start - travel - i.settings.bufferMinutes * MINUTE;
  const readyAt = leaveAt - prep;
  const arriveAt = leaveAt + travel;
  return {
    phoneAlertAt,
    phoneLeaveAt,
    phoneArriveAt,
    phoneLateMinutes: Math.max(0, Math.round((phoneArriveAt - i.start) / MINUTE)),
    readyAt,
    leaveAt,
    arriveAt,
    earlyMinutes: Math.max(0, Math.round((i.start - arriveAt) / MINUTE)),
  };
}

/**
 * Maya, 34, is an illustrative persona, not a real user: a 10:30 dentist
 * appointment 22 minutes away, "20 minutes" to get ready, and the usual
 * 15-minute calendar reminder.
 */
export const MAYA = { age: 34, title: 'Dentist', at: { hour: 10, minute: 30 }, travelMinutes: 22, prepMinutes: 20, phoneLeadMinutes: 15 } as const;

export function mayaMorning(dayKey: string, settings: Settings): BeforeAfter {
  return beforeAfter({
    start: zonedToEpoch({ ...parseDayKey(dayKey), ...MAYA.at }, settings.timeZone),
    travelMinutes: MAYA.travelMinutes,
    prepMinutes: MAYA.prepMinutes,
    phoneLeadMinutes: MAYA.phoneLeadMinutes,
    settings,
  });
}
