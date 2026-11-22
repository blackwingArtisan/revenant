import { readOnCall } from '../engine/escalate';
import type { RuntimeState } from '../engine/runtime';
import type { Alert, Commitment, Place, Settings } from '../engine/types';

/** A page in the pager's message memory: the alert plus when it actually arrived. */
export interface MemoryEntry extends Alert {
  receivedAt: number;
}

/** What the person did with prep-time suggestions: routines dismissed for good, and when each applied one started counting afresh. */
export interface PrepAdviceState {
  dismissed: string[];
  since: Record<string, number>;
}

export const emptyPrepAdvice = (): PrepAdviceState => ({ dismissed: [], since: {} });

export interface Snapshot {
  version: 1;
  commitments: Commitment[];
  places: Place[];
  settings: Settings;
  runtime: RuntimeState;
  /** Message memory, newest first, like a pager's stored pages. */
  memory: MemoryEntry[];
  /** Optional so snapshots saved before suggestions existed still load. */
  prepAdvice?: PrepAdviceState;
  /** Ids of the 666 rebook pages already answered (Rebook or Let it go). Optional for older snapshots. */
  rebooksDone?: string[];
}

/** Port: where the pager keeps its state. Local storage today; a synced store later. */
export interface PagerStore {
  load(): Snapshot | null;
  save(snapshot: Snapshot): void;
  clear(): void;
}

export class MemoryStore implements PagerStore {
  private value: Snapshot | null = null;
  load() {
    return this.value ? structuredClone(this.value) : null;
  }
  save(snapshot: Snapshot) {
    this.value = structuredClone(snapshot);
  }
  clear() {
    this.value = null;
  }
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Snapshot>;
  return (
    v.version === 1 &&
    Array.isArray(v.commitments) &&
    Array.isArray(v.places) &&
    typeof v.settings === 'object' &&
    v.settings !== null &&
    typeof v.runtime === 'object' &&
    v.runtime !== null &&
    Array.isArray(v.memory)
  );
}

/**
 * A loaded snapshot with its on-call setting cleaned: a missing one stays missing (escalation off),
 * a malformed one is dropped (off), and the rest of the snapshot is kept untouched.
 */
export function cleanSnapshot(snapshot: Snapshot): Snapshot {
  if (snapshot.settings.onCall === undefined) return snapshot;
  const onCall = readOnCall(snapshot.settings.onCall);
  const { onCall: _stored, ...rest } = snapshot.settings;
  return { ...snapshot, settings: onCall ? { ...rest, onCall } : rest };
}

/** Browser storage. Every access is guarded: private windows and blocked storage just fall back to a fresh pager. */
export class LocalStorageStore implements PagerStore {
  constructor(private readonly key = 'revenant-pager:v1') {}

  load(): Snapshot | null {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? cleanSnapshot(parsed) : null;
    } catch {
      return null;
    }
  }

  save(snapshot: Snapshot): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(snapshot));
    } catch {
      // storage full or blocked: the pager keeps working in memory
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
