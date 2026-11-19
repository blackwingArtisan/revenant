# Design: Time-blind paging

## Overview
Revenant is a static PWA. All paging logic is a pure engine in `src/engine`; the React app is a thin shell that feeds it a clock, commitments and travel times, and renders what it returns. The only server is an optional AWS relay for the real path.

```
            +-------------------- browser (PWA) ---------------------+
 .ics file -> ics.ts -> importer.ts --+                               |
 Add form  ---------------------------+-> commitments                 |
                                          |                           |
 TravelEstimator (straight-line | relay) -> resolveTravel -> minutes   |
                                          v                           |
 settings + clock(now) -----------> planDays (pure) -> Plan (pages)   |
                                          v                           |
                         tick(plan, runtimeState, now) -> fresh alerts |
                                          v                           |
           LCD + chirp + live region      PagerChannel.deliver(alert) |
           ACK -> acknowledge()           (notification | relay SMS)  |
            +-----------------------------------------|---------------+
                                                      v
                       relay (Lambda): CalculateRoutes | SendTextMessage | CreateSchedule/DeleteSchedule
```

## Components
| Component | File | Responsibility |
|---|---|---|
| Zoned time | `src/engine/time.ts` | Wall time <-> epoch in an IANA zone, DST gap and overlap rules, day keys |
| Planner | `src/engine/plan.ts` | Candidate pages per commitment, budget ranking, digest, body double |
| Escalation | `src/engine/alerts.ts` | Alerts up to an instant, page status, next alert time |
| Runtime | `src/engine/runtime.ts` | Deliver-once ticking, coalescing, ACK, rewind |
| Calendar | `src/engine/ics.ts`, `importer.ts` | RFC 5545 subset, recurrence, place matching, merge |
| Clock | `src/adapters/clock.ts` | `SimClock`: pause, jump, speed |
| Travel | `src/adapters/travel.ts`, `resolve-travel.ts` | Port, straight-line and relay estimators, route cache |
| Channel | `src/adapters/channel.ts` | Port, browser notifications, relay SMS, memory |
| Store | `src/adapters/storage.ts` | Guarded localStorage snapshot |
| Relay | `src/relay/handler.ts`, `lambda.ts` | Location routes, SMS, Scheduler, shared-secret check |
| App | `src/app/*` | Pager, time machine, day sheet, forms, service worker |

## Data models
```ts
interface Commitment { id; title; kind: 'appointment' | 'focus'; start; end; placeId; prepMinutes;
  priority: 'must' | 'normal' | 'low'; checkInEveryMinutes; source; allDay? }
interface Settings { timeZone; dailyBudget; honestyFactor; bufferMinutes; escalationMinutes: number[];
  digestTime; homePlaceId; travelMode; defaultTravelMinutes }
interface PlannedPage { id; commitmentId; kind; code; text; fireAt; escalateAt: number[]; cutoffAt;
  silent; countsToBudget; priority; dayKey }
interface Alert { id: `${pageId}#${level}`; pageId; level; at; code; text; silent }
interface RuntimeState { acks: Record<pageId, epochMs>; delivered: alertId[] }
```

## Key algorithms
**Lead times.** `leave = start - (travel + buffer)`, `ready = leave - round(prep x honesty)`. Arithmetic is on epoch ms, so DST never shifts a page; only labels are converted to wall time.

**Escalation.** `escalateAt = fireAt + offsets`, filtered to `< cutoffAt`. `alertsForPage(page, ackAt, now)` returns level 0 at `fireAt` and level k at `escalateAt[k-1]` while `ackAt` is later than that repeat. Pure, so any instant can be asked about.

**Deliver-once runtime.** `tick` compares `alertsUpTo(now)` with the delivered set, marks all due alerts delivered, drops those past their cutoff as stale, and returns the highest level per page. ACK is a timestamp, so `rewind(to)` simply forgets deliveries and ACKs after `to`.

**Budget.** Per local day of `fireAt`, rank `countsToBudget` pages by (already beeped, priority, kind, time, id) and keep the first N. Riders (check-ins, wrap-ups) follow their focus-start page. Pinning already-beeped pages keeps the plan stable when a new must-page arrives mid-day.

**Remote schedule sync.** `diffSchedules(sent, pages, acks, now)` keeps a signature of each page's full beep run. Unchanged pages send nothing; a page whose signature changed is withdrawn and its future beeps scheduled again; a page gone from the plan is withdrawn. The relay replaces a schedule on name conflict, so re-sending after a reload is safe.

**Recurrence.** Expanded on local calendar days and converted with `zonedToEpoch` at the original wall time, so a weekly 9:00 meeting stays at 9:00 across DST. COUNT counts excluded dates, as RFC 5545 requires.

## Error handling
- Storage blocked or full: the pager keeps working in memory.
- Travel adapter error: the commitment uses the default travel time.
- Notification permission denied: in-app LCD, chirp and live region still page.
- Unknown TZID or rule: imported with the fallback zone or first occurrence, with a warning.
- Relay: 401 without the secret, 503 if unconfigured, 400 on bad input, 502 with the AWS error name.

## Testing strategy
- Unit (Vitest): zoned time and DST, lead times, honesty factor, escalation, ACK, coalescing, stale pages, budget ranking and pinning, digest timing, body double, determinism, .ics parsing and recurrence, import matching and merge, adapters with stubbed fetch and notification hosts, relay with stubbed AWS clients.
- End to end (Playwright, production build, America/Chicago): add a commitment, time-travel, see 411 then 911 with the right text, ignore it and see 911 911, ACK by button and key; missed page shown as 666; budget and digest; body double; .ics import and re-import; 900x run that pauses on the page; reload persistence; keyboard tabs; phone layout with the docked ACK; axe-core WCAG 2.1 AA scan; reduced motion stops animation but keeps the page; the one-press demo day (sample load, 900x run, ACK resumes); the LCD line starts at the left edge and scrolls only when it overflows; the service worker shows a page as a notification with an ACK action and relays that ACK to the app (full Chromium in new headless mode, which grants notification permission); and the app shell opens offline.
