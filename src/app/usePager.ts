import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeliveryReceipt } from '../adapters/channel';
import { SimClock } from '../adapters/clock';
import { locatePlace, placeForTypedAddress } from '../adapters/geocode';
import { resolveTravel } from '../adapters/resolve-travel';
import { diffSchedules, type ScheduledSet } from '../adapters/schedule-sync';
import { selectAdapters } from '../adapters/select';
import { emptyPrepAdvice, LocalStorageStore, type MemoryEntry, type PrepAdviceState, type Snapshot } from '../adapters/storage';
import { nextAlertAt, pageStatus } from '../engine/alerts';
import { parseIcs } from '../engine/ics';
import { icsToCommitments, mergeCommitments } from '../engine/importer';
import { suggestPrepTimes, type PrepSuggestion } from '../engine/learn';
import { planDays } from '../engine/plan';
import { acknowledge, activePages, emptyRuntimeState, firstDueBetween, pinnedPageIds, rewind, tick, type RuntimeState } from '../engine/runtime';
import { defaultSettings, sampleDay, SAMPLE_PLACES } from '../engine/sample';
import { addDays, DAY, HOUR, isValidTimeZone, localDayKey, parseDayKey, startOfDay, zonedToEpoch } from '../engine/time';
import type { Commitment, PageStatus, Place, PlannedPage, Settings } from '../engine/types';
import { beep, unlockAudio } from './beep';

const MEMORY_SIZE = 30;
const store = new LocalStorageStore();
// The local geocoder reads the saved places through this holder, which the hook keeps current.
const savedPlaces: { current: Place[] } = { current: [] };
const adapters = selectAdapters(import.meta.env as Record<string, string | undefined>, () => savedPlaces.current);

/** How many days of past leave-now pages the pager looks back over when it learns. */
const LEARN_DAYS = 14;

interface Boot {
  clock: SimClock;
  snapshot: Snapshot;
}

function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function freshSnapshot(timeZone: string): Snapshot {
  return {
    version: 1,
    commitments: [],
    places: SAMPLE_PLACES,
    settings: defaultSettings(timeZone),
    runtime: emptyRuntimeState(),
    memory: [],
  };
}

/**
 * URL switches for demos and tests:
 *   ?at=2026-11-19T08:00  start the clock there (wall time in the pager's zone), paused
 *   ?speed=60             run the clock at 60x
 *   ?tz=America/Chicago   time zone for a fresh pager
 *   ?fresh                ignore saved state
 *   ?sample               load the sample day
 */
function boot(): Boot {
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const tzParam = params.get('tz');
  const zone = tzParam && isValidTimeZone(tzParam) ? tzParam : detectZone();
  const saved = params.has('fresh') ? null : store.load();
  const snapshot = saved ?? freshSnapshot(zone);
  const tz = snapshot.settings.timeZone;

  let start = Date.now();
  let speed = 1;
  const at = params.get('at');
  if (at) {
    const wall = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(at);
    const parsed = wall
      ? zonedToEpoch({ year: +wall[1]!, month: +wall[2]!, day: +wall[3]!, hour: +wall[4]!, minute: +wall[5]! }, tz)
      : Date.parse(at);
    if (Number.isFinite(parsed)) {
      start = parsed;
      speed = 0;
    }
  }
  const speedParam = Number(params.get('speed'));
  if (params.has('speed') && Number.isFinite(speedParam)) speed = Math.max(0, speedParam);

  if (params.has('sample')) {
    snapshot.commitments = mergeCommitments(snapshot.commitments, sampleDay(localDayKey(start, tz), tz));
  }
  return { clock: new SimClock(start, speed), snapshot };
}

function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export interface ImportReport {
  fileName: string;
  imported: number;
  newPlaces: number;
  warnings: string[];
}

export type NewCommitment = Omit<Commitment, 'id' | 'source'>;

export function usePager() {
  const [{ clock, snapshot: initial }] = useState(boot);
  const [commitments, setCommitments] = useState<Commitment[]>(initial.commitments);
  const [places, setPlaces] = useState<Place[]>(initial.places);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [runtime, setRuntimeState] = useState<RuntimeState>(initial.runtime);
  const [memory, setMemory] = useState<MemoryEntry[]>(initial.memory);
  const [advice, setAdvice] = useState<PrepAdviceState>(initial.prepAdvice ?? emptyPrepAdvice());
  const [now, setNow] = useState(() => clock.now());
  const [speed, setSpeedState] = useState(clock.speed);
  const [travel, setTravel] = useState<Record<string, number>>({});
  const [beeps, setBeeps] = useState(0);
  const [readIndex, setReadIndex] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  const [stopOnBeep, setStopOnBeep] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [lastReceipt, setLastReceipt] = useState<DeliveryReceipt | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  const runtimeRef = useRef(runtime);
  const setRuntime = useCallback((next: RuntimeState) => {
    runtimeRef.current = next;
    setRuntimeState(next);
  }, []);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const stopRef = useRef(stopOnBeep);
  stopRef.current = stopOnBeep;
  const travelCache = useRef(new Map<string, number | null>());
  // True while "Run the day" is in charge of the clock: ACK on a page it stopped at resumes the run.
  const dayRunRef = useRef(false);
  const [dayRun, setDayRunState] = useState(false);
  const setDayRun = useCallback((on: boolean) => {
    dayRunRef.current = on;
    setDayRunState(on);
  }, []);

  const tz = settings.timeZone;
  const dayKey = localDayKey(now, tz);
  savedPlaces.current = places;

  // Clock: 4 ticks a second is plenty for a pager and cheap at 900x.
  useEffect(() => {
    const id = window.setInterval(() => setNow(clock.now()), 250);
    return () => window.clearInterval(id);
  }, [clock]);

  // Travel times from the travel adapter (straight-line locally, Amazon Location in the real path).
  useEffect(() => {
    let cancelled = false;
    void resolveTravel(commitments, places, settings, adapters.travel, travelCache.current).then((t) => {
      if (!cancelled) setTravel(t);
    });
    return () => {
      cancelled = true;
    };
  }, [commitments, places, settings]);

  const pinned = useMemo(() => pinnedPageIds(runtime), [runtime]);
  const plan = useMemo(
    () => planDays({ commitments, places, settings, travelMinutes: travel, dayKeys: [dayKey, addDays(dayKey, 1)], pinnedPageIds: pinned }),
    [commitments, places, settings, travel, dayKey, pinned],
  );

  // Advice: which routines are usually ACK'd late. History needs the past days' pages,
  // so plan them separately; this plan is never delivered.
  const historyPlan = useMemo(
    () =>
      planDays({
        commitments,
        places,
        settings,
        travelMinutes: travel,
        dayKeys: Array.from({ length: LEARN_DAYS + 1 }, (_, i) => addDays(dayKey, i - LEARN_DAYS)),
        pinnedPageIds: pinned,
      }),
    [commitments, places, settings, travel, dayKey, pinned],
  );
  const minute = Math.floor(now / 60_000) * 60_000;
  const prepSuggestions = useMemo<PrepSuggestion[]>(
    () =>
      suggestPrepTimes({ pages: historyPlan.pages, commitments, acks: runtime.acks, settings, now: minute, ignoreBefore: advice.since }).filter(
        (s) => !advice.dismissed.includes(s.routineKey),
      ),
    [historyPlan, commitments, runtime.acks, settings, minute, advice],
  );

  // The pager loop: deliver whatever has come due.
  const lastTickRef = useRef(now);
  useEffect(() => {
    let at = now;
    if (stopRef.current && clock.speed > 1) {
      // A fast clock covers several minutes per tick: stop on the first page in that step.
      at = firstDueBetween(plan.pages, runtimeRef.current, lastTickRef.current, now) ?? now;
    }
    lastTickRef.current = at;
    const r = tick(plan.pages, runtimeRef.current, at);
    if (r.state === runtimeRef.current) return;
    setRuntime(r.state);
    if (r.fresh.length === 0) return;
    const received = r.fresh.map((a) => ({ ...a, receivedAt: at }));
    setMemory((m) => [...received.reverse(), ...m].slice(0, MEMORY_SIZE));
    setReadIndex(null);
    const loud = r.fresh.filter((a) => !a.silent);
    if (loud.length > 0) {
      setBeeps((b) => b + 1);
      if (soundRef.current) beep(Math.max(...loud.map((a) => a.level)));
    }
    const top = r.fresh[r.fresh.length - 1]!;
    setAnnouncement(`Page ${top.code}. ${top.text}`);
    for (const a of r.fresh) void adapters.channel.deliver(a).then(setLastReceipt, () => undefined);
    if (stopRef.current && clock.speed > 1) {
      // A fast clock overshoots between ticks; stop exactly when the page went off.
      clock.pause();
      clock.jumpTo(Math.max(...r.fresh.map((a) => a.at)));
      setNow(clock.now());
      setSpeedState(0);
    }
  }, [now, plan, clock, setRuntime]);

  // Real path only: hand future beeps to the relay's scheduler so pages go out
  // with the app closed. The time machine never touches a real scheduler.
  const scheduledRef = useRef<ScheduledSet>({});
  useEffect(() => {
    const channel = adapters.channel;
    if (!channel.schedule || !clock.isLive) return;
    const diff = diffSchedules(scheduledRef.current, plan.pages, runtime.acks, clock.now());
    if (diff.withdraw.length === 0 && diff.create.length === 0) return;
    scheduledRef.current = diff.next;
    void (async () => {
      for (const pageId of diff.withdraw) await channel.withdraw(pageId);
      if (diff.create.length > 0 && !(await channel.schedule!(diff.create))) scheduledRef.current = {};
    })().catch(() => {
      scheduledRef.current = {};
    });
  }, [plan, runtime.acks, clock]);

  // Save everything the user would expect to survive a reload.
  useEffect(() => {
    store.save({ version: 1, commitments, places, settings, runtime, memory, prepAdvice: advice });
  }, [commitments, places, settings, runtime, memory, advice]);

  const active = useMemo(() => activePages(plan.pages, runtime, now), [plan, runtime, now]);

  const ack = useCallback(
    (pageId?: string) => {
      unlockAudio();
      const target = pageId ?? activePages(plan.pages, runtimeRef.current, clock.now())[0]?.id;
      if (!target) {
        setReadIndex(null);
        return;
      }
      setRuntime(acknowledge(runtimeRef.current, target, clock.now()));
      setReadIndex(null);
      setAnnouncement('Page acknowledged.');
      void adapters.channel.withdraw(target).catch(() => undefined);
      if (dayRunRef.current && clock.speed === 0) {
        clock.setSpeed(900);
        setSpeedState(900);
      }
    },
    [plan, clock, setRuntime],
  );

  // ACK from the lock-screen notification, relayed by the service worker.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent<{ type?: string; pageId?: string }>) => {
      if (e.data?.type === 'ack' && typeof e.data.pageId === 'string') ack(e.data.pageId);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [ack]);

  const read = useCallback(() => {
    unlockAudio();
    setReadIndex((i) => (memory.length === 0 ? null : i === null ? 0 : i + 1 >= memory.length ? null : i + 1));
  }, [memory.length]);

  const travelTo = useCallback(
    (target: number) => {
      unlockAudio();
      const current = clock.now();
      if (target < current) {
        setRuntime(rewind(plan.pages, runtimeRef.current, target));
        setMemory((m) => m.filter((e) => e.receivedAt <= target));
      }
      clock.jumpTo(target);
      setNow(clock.now());
      setReadIndex(null);
    },
    [clock, plan, setRuntime],
  );

  const controls = {
    speed,
    dayRun,
    stopOnBeep,
    setStopOnBeep,
    advance: (ms: number) => travelTo(clock.now() + ms),
    travelTo,
    nextPage: () => {
      const t = nextAlertAt(plan.pages, runtimeRef.current.acks, clock.now());
      if (t === null) setAnnouncement('Nothing else will page today or tomorrow.');
      else travelTo(t);
    },
    setSpeed: (n: number) => {
      unlockAudio();
      setDayRun(false);
      clock.setSpeed(n);
      setSpeedState(n);
    },
    backToNow: () => {
      setDayRun(false);
      travelTo(Date.now());
      clock.backToNow();
      setSpeedState(1);
    },
    runDay: () => {
      travelTo(startOfDay(dayKey, tz) + 6 * HOUR);
      setDayRun(true);
      setStopOnBeep(true);
      clock.setSpeed(900);
      setSpeedState(900);
    },
  };

  /** One-press demo: load the sample day if the pager is empty, then run it from 6 AM. */
  const demoDay = () => {
    if (commitments.length === 0) setCommitments((list) => mergeCommitments(list, sampleDay(dayKey, tz)));
    controls.runDay();
  };

  /**
   * Add a commitment. A typed address that matches no saved place becomes a new
   * place, and the geocoder is asked for its coordinates once; on a result the
   * place gets them (so travel uses them), on no match it keeps the default travel time.
   */
  const addCommitment = useCallback((c: NewCommitment, address?: string) => {
    let placeId = c.placeId;
    if (address?.trim()) {
      const { place, created } = placeForTypedAddress(address, savedPlaces.current, () => newId('place'));
      placeId = place.id;
      if (created) {
        savedPlaces.current = [...savedPlaces.current, place];
        setPlaces((list) => [...list, place]);
        void locatePlace(place, adapters.geocoder).then((located) => {
          const point = located.point;
          if (point) setPlaces((list) => list.map((p) => (p.id === place.id && p.point === null ? { ...p, point } : p)));
        });
      }
    }
    const full: Commitment = { ...c, placeId, id: newId('c'), source: 'manual' };
    setCommitments((list) => mergeCommitments(list, [full]));
    return full;
  }, []);

  /** Apply a suggestion: set the new prep time on the routine's commitments that are still ahead, and start counting afresh. */
  const applyPrepSuggestion = useCallback(
    (s: PrepSuggestion) => {
      const at = clock.now();
      setCommitments((list) =>
        list.map((c) => (s.commitmentIds.includes(c.id) && (c.id === s.commitmentId || c.start > at) ? { ...c, prepMinutes: s.suggestedPrepMinutes } : c)),
      );
      setAdvice((a) => ({ ...a, since: { ...a.since, [s.routineKey]: at } }));
      setAnnouncement(`Prep time for ${s.title} is now ${s.suggestedPrepMinutes} minutes.`);
    },
    [clock],
  );

  const dismissPrepSuggestion = useCallback((s: PrepSuggestion) => {
    setAdvice((a) => (a.dismissed.includes(s.routineKey) ? a : { ...a, dismissed: [...a.dismissed, s.routineKey] }));
    setAnnouncement(`Suggestion for ${s.title} dismissed.`);
  }, []);

  const removeCommitment = useCallback((id: string) => setCommitments((list) => list.filter((c) => c.id !== id)), []);

  const loadSample = useCallback(() => {
    unlockAudio();
    setCommitments((list) => mergeCommitments(list, sampleDay(dayKey, tz)));
  }, [dayKey, tz]);

  const importIcs = useCallback(
    (text: string, fileName: string) => {
      const from = startOfDay(dayKey, tz);
      const { events, warnings } = parseIcs(text, { defaultTimeZone: tz, windowStart: from, windowEnd: from + 30 * DAY });
      const { commitments: incoming, newPlaces } = icsToCommitments(events, places, { prepMinutes: 15, priority: 'normal' });
      setPlaces((p) => [...p, ...newPlaces.filter((n) => !p.some((x) => x.id === n.id))]);
      setCommitments((list) => mergeCommitments(list, incoming));
      const report = { fileName, imported: incoming.length, newPlaces: newPlaces.length, warnings };
      setImportReport(report);
      return report;
    },
    [dayKey, tz, places],
  );

  const addPlace = useCallback((p: Omit<Place, 'id'>) => setPlaces((list) => [...list, { ...p, id: newId('place') }]), []);
  const removePlace = useCallback((id: string) => setPlaces((list) => list.filter((p) => p.id !== id)), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const reset = useCallback(() => {
    store.clear();
    const fresh = freshSnapshot(tz);
    setCommitments(fresh.commitments);
    setPlaces(fresh.places);
    setSettings(fresh.settings);
    setRuntime(fresh.runtime);
    setMemory([]);
    setAdvice(emptyPrepAdvice());
    setReadIndex(null);
    setImportReport(null);
    travelCache.current.clear();
  }, [tz, setRuntime]);

  const requestNotifications = useCallback(async () => {
    unlockAudio();
    if (typeof Notification === 'undefined') return;
    try {
      setNotifyPermission(await Notification.requestPermission());
    } catch {
      setNotifyPermission(Notification.permission);
    }
  }, []);

  const statusOf = useCallback((p: PlannedPage): PageStatus => pageStatus(p, runtime.acks, now), [runtime, now]);

  const today = plan.days[0]!;
  const shown: MemoryEntry | null =
    readIndex !== null ? (memory[readIndex] ?? null) : active[0] ? (memory.find((m) => m.pageId === active[0]!.id) ?? null) : null;

  return {
    now,
    tz,
    dayKey,
    dayStart: startOfDay(dayKey, tz),
    dayDate: parseDayKey(dayKey),
    plan,
    today,
    commitments,
    places,
    settings,
    runtime,
    memory,
    active,
    shown,
    readIndex,
    beeps,
    sound,
    setSound,
    announcement,
    lastReceipt,
    importReport,
    notifyPermission,
    adapterSummary: adapters.summary,
    prepSuggestions,
    applyPrepSuggestion,
    dismissPrepSuggestion,
    travel,
    next: nextAlertAt(plan.pages, runtime.acks, now),
    controls,
    demoDay,
    ack,
    read,
    statusOf,
    addCommitment,
    removeCommitment,
    loadSample,
    importIcs,
    addPlace,
    removePlace,
    updateSettings,
    reset,
    requestNotifications,
  };
}

export type PagerApi = ReturnType<typeof usePager>;
