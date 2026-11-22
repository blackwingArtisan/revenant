export type Priority = 'must' | 'normal' | 'low';
export type CommitmentKind = 'appointment' | 'focus';
export type TravelMode = 'car' | 'transit' | 'bike' | 'walk';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  /** Null when the place has no coordinates yet; travel then uses the default estimate. */
  point: GeoPoint | null;
  /** A video call or anything else that needs no travel. */
  virtual?: boolean;
}

export interface Commitment {
  id: string;
  title: string;
  kind: CommitmentKind;
  /** Epoch ms. */
  start: number;
  /** Epoch ms. */
  end: number;
  placeId: string | null;
  /** How long getting ready really takes, before the honesty factor. */
  prepMinutes: number;
  priority: Priority;
  /** Body-double cadence for focus blocks; null means no check-ins. */
  checkInEveryMinutes: number | null;
  source: 'manual' | 'ics' | 'sample';
  /** True for all-day calendar entries: they never page, they go in the digest. */
  allDay?: boolean;
}

/** Opt-in on-call escalation: who is paged on a second pager when a must-go 911 goes unanswered. */
export interface OnCallSettings {
  enabled: boolean;
  /** The secondary's name as typed: trimmed, 1-24 characters, no control characters. */
  name: string;
}

export interface Settings {
  timeZone: string;
  /** Hard cap on beeping pages per local day. */
  dailyBudget: number;
  /** Multiplier on stated prep time. People with ADHD routinely underestimate. */
  honestyFactor: number;
  /** Minutes of slack between arriving and the start time. */
  bufferMinutes: number;
  /** Minutes after the first beep at which an unacknowledged page repeats. */
  escalationMinutes: number[];
  /** Local time of the quiet morning digest. */
  digestTime: { hour: number; minute: number };
  homePlaceId: string | null;
  travelMode: TravelMode;
  /** Used when a place has no coordinates. */
  defaultTravelMinutes: number;
  /** Absent means escalation is off. */
  onCall?: OnCallSettings;
}

export type PageKind = 'get-ready' | 'leave-now' | 'focus-start' | 'check-in' | 'wrap-up' | 'digest' | 'escalation';

export interface PlannedPage {
  /** Stable id: `${commitmentId}:${kind}` (check-ins add `:${n}`; digest is `digest:${dayKey}`). */
  id: string;
  commitmentId: string | null;
  kind: PageKind;
  code: string;
  /** Short LCD text, upper case. */
  text: string;
  fireAt: number;
  /** Repeat times for an unacknowledged page (already cut off before `cutoffAt`). */
  escalateAt: number[];
  /** After this instant the page is moot: no more repeats, and unacknowledged means missed. */
  cutoffAt: number;
  /** A silent page shows on the LCD without a beep (the digest). */
  silent: boolean;
  countsToBudget: boolean;
  priority: Priority;
  dayKey: string;
  /** Escalation pages only: the leave-now page that, if acknowledged at or before this page's fireAt, cancels it. */
  dependsOn?: string;
  /** Escalation pages only: the secondary's name, for the day sheet and the receipt. */
  secondaryName?: string;
}

export type DigestReason = 'low-priority' | 'over-budget' | 'all-day';

export interface DigestItem {
  pageId: string | null;
  commitmentId: string;
  title: string;
  /** When the user would have been paged, or the start for all-day items. */
  at: number;
  reason: DigestReason;
  kind: PageKind | 'all-day';
}

export interface DayPlan {
  dayKey: string;
  pages: PlannedPage[];
  digest: DigestItem[];
  budget: { limit: number; used: number };
}

export interface Plan {
  days: DayPlan[];
  /** Every page across days, sorted by fire time. */
  pages: PlannedPage[];
}

export interface Alert {
  /** `${pageId}#${level}` */
  id: string;
  pageId: string;
  /** 0 = first beep, 1+ = escalation repeats. */
  level: number;
  at: number;
  code: string;
  text: string;
  silent: boolean;
}

export type PageStatus = 'scheduled' | 'paging' | 'acked' | 'missed';

/** PageStatus plus `cancelled`: an escalation page whose leave-now page was answered in time. */
export type EscalationStatus = PageStatus | 'cancelled';
