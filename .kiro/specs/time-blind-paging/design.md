# Design: Time-blind paging

## Overview
Revenant is a static PWA. All paging logic is a pure engine in `src/engine`; the React app is a thin shell that feeds it a clock, commitments and travel times, and renders what it returns. The only server is an optional AWS relay for the real path.

```
            +-------------------- browser (PWA) ---------------------+
 .ics file -> ics.ts -> importer.ts --+                               |
 Add form  ---------------------------+-> commitments                 |
                                          |                           |
 Geocoder (saved places | relay) --> place coordinates                  |
 TravelEstimator (straight-line | relay) -> resolveTravel -> minutes   |
                                          v                           |
 settings + clock(now) -----------> planDays (pure) -> Plan (pages)   |
                                          v                           |
                         tick(plan, runtimeState, now) -> fresh alerts |
                         suggestPrepTimes(pages, acks, now) -> advice  |
                                          v                           |
           LCD + chirp + live region      PagerChannel.deliver(alert) |
           ACK -> acknowledge()           (notification | relay SMS)  |
            +-----------------------------------------|---------------+
                                                      v
                       relay (Lambda): CalculateRoutes | Geocode | SendTextMessage | CreateSchedule/DeleteSchedule
```

## Components
| Component | File | Responsibility |
|---|---|---|
| Zoned time | `src/engine/time.ts` | Wall time <-> epoch in an IANA zone, DST gap and overlap rules, day keys |
| Planner | `src/engine/plan.ts` | Candidate pages per commitment, budget ranking, digest, body double |
| Escalation | `src/engine/alerts.ts` | Alerts up to an instant, page status, next alert time |
| Runtime | `src/engine/runtime.ts` | Deliver-once ticking, coalescing, ACK, rewind |
| Learner | `src/engine/learn.ts` | Suggests a longer prep time for routines whose leave-now page is usually ACK'd late. Pure and advisory |
| Calendar | `src/engine/ics.ts`, `importer.ts` | RFC 5545 subset, recurrence, place matching, merge |
| Clock | `src/adapters/clock.ts` | `SimClock`: pause, jump, speed |
| Travel | `src/adapters/travel.ts`, `resolve-travel.ts` | Port, straight-line and relay estimators, route cache |
| Geocoder | `src/adapters/geocode.ts` | Port, saved-places and relay geocoders, typed-address helpers |
| Channel | `src/adapters/channel.ts` | Port, browser notifications, relay SMS, memory |
| Store | `src/adapters/storage.ts` | Guarded localStorage snapshot |
| Relay | `src/relay/handler.ts`, `lambda.ts` | Location routes, Places geocoding, SMS, Scheduler, shared-secret check |
| App | `src/app/*` | Pager, time machine, day sheet, prep suggestions, forms, service worker |

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
interface PrepSuggestion { routineKey; commitmentId; commitmentIds; title; currentPrepMinutes; suggestedPrepMinutes; lateCount; sampled }
interface Geocoder { readonly name: string; geocode(address): Promise<{ lat; lon; label } | null> }
```
The stored snapshot gains an optional `prepAdvice: { dismissed: routineKey[]; since: Record<routineKey, epochMs> }`, so snapshots saved earlier still load.

## Key algorithms
**Lead times.** `leave = start - (travel + buffer)`, `ready = leave - round(prep x honesty)`. Arithmetic is on epoch ms, so DST never shifts a page; only labels are converted to wall time.

**Escalation.** `escalateAt = fireAt + offsets`, filtered to `< cutoffAt`. `alertsForPage(page, ackAt, now)` returns level 0 at `fireAt` and level k at `escalateAt[k-1]` while `ackAt` is later than that repeat. Pure, so any instant can be asked about.

**Deliver-once runtime.** `tick` compares `alertsUpTo(now)` with the delivered set, marks all due alerts delivered, drops those past their cutoff as stale, and returns the highest level per page. ACK is a timestamp, so `rewind(to)` simply forgets deliveries and ACKs after `to`.

**Budget.** Per local day of `fireAt`, rank `countsToBudget` pages by (already beeped, priority, kind, time, id) and keep the first N. Riders (check-ins, wrap-ups) follow their focus-start page. Pinning already-beeped pages keeps the plan stable when a new must-page arrives mid-day.

**Remote schedule sync.** `diffSchedules(sent, pages, acks, now)` keeps a signature of each page's full beep run. Unchanged pages send nothing; a page whose signature changed is withdrawn and its future beeps scheduled again; a page gone from the plan is withdrawn. The relay replaces a schedule on name conflict, so re-sending after a reload is safe.

**Learning from late ACKs (Req 9).** `suggestPrepTimes({ pages, commitments, acks, settings, now, ignoreBefore })` is a pure function that returns suggestions and changes nothing.
- *Routine.* A commitment has exactly one leave-now page, so there is no history inside one commitment. Commitments with the same normalized title at the same place form a routine, and the learner reads that history. A weekly calendar event or an errand typed again each week is one routine.
- *Level of an ACK.* The level is the number of the page's repeats due at or before the ACK time, before the cutoff. An ACK at the very instant of a repeat counts as answering that repeat, because the pager delivers a due repeat before the person can press ACK. An ACK at or after the cutoff counts as late.
- *Outcome.* Each leave-now page is acknowledged on time (level 0), late (level 1 or more, or after the cutoff), missed (cutoff passed, no ACK), or still open. Open pages are skipped. Missed pages count as late.
- *Window.* The last 3 answered pages of the routine, by fire time. Two or more late ones trigger a suggestion.
- *New prep time.* current + mean lateness in minutes, rounded up to 5, and never less than current + 5, capped at 120. Lateness of an acknowledged page is the time from its first beep to the ACK (capped at its cutoff); lateness of a missed page is the longest escalation offset in settings (at least 5 min), the least we know. The honesty factor is not applied: lateness is measured in real minutes, and the suggestion is in stated minutes, so it errs small and the person can apply again.
- *Budget.* Prep time only moves the existing get-ready page earlier. Routines with prep 0 get no suggestion, because applying one would add a get-ready page. A suggestion therefore never changes the number of beeping pages and the daily budget holds.
- *History.* The app plans the past 14 days separately with `planDays` (never delivered) so earlier days' leave-now pages are available. Plans use today's settings and the current commitments.
- *State.* Apply sets `prepMinutes` on the suggested commitment and on the routine's commitments that have not started, through `setCommitments`, and records `since[routineKey] = now`, so only pages after that count. Dismiss adds the routine to `dismissed`. Both live in the saved snapshot.
- *UI.* `PrepAdvice` sits at the top of the day sheet: the commitment title, the text "You often ACK this one late. Try N min prep instead of M.", and Apply and Dismiss buttons with names that include the title.

**Geocoding typed addresses (Req 10).** The add form has an optional "Or type an address" field. `placeForTypedAddress` returns a saved place when `matchPlace` finds one, otherwise a new place without coordinates. For a new place the app calls `locatePlace(place, geocoder)` once; a result sets `place.point`, no result or an error leaves the place alone, so travel falls back to the default. `resolveTravel` includes coordinates in its cache key, so a route estimated as unknown is estimated again once the place has coordinates.
- *Local geocoder.* `SavedPlacesGeocoder` matches the address against saved places that have coordinates. It never invents coordinates.
- *Relay geocoder.* `RelayGeocoder` POSTs `{ address }` to `/geocode` with `x-relay-secret`. A non-200 answer, a malformed body or a network error all give `null`. It is chosen with `VITE_TRAVEL=relay` and a relay URL.
- *Relay route.* `POST /geocode` validates the address (non-empty, at most 200 characters, else 400), then needs a `PlacesClient` (else 501 "geocoding not configured"), calls the GeoPlaces v2 `Geocode` operation with `QueryText` and `MaxResults: 1`, and returns `{ lat, lon, label }` from the first result (`Position` is `[lon, lat]`), or 404 when there is no usable result. `@aws-sdk/client-geo-places` is not installed, so the Geocode input and output shapes and a `GeocodeRequest` wrapper are typed locally in `handler.ts`, and `lambda.ts` leaves `places` unset until an operator adds the package.

**Recurrence.** Expanded on local calendar days and converted with `zonedToEpoch` at the original wall time, so a weekly 9:00 meeting stays at 9:00 across DST. COUNT counts excluded dates, as RFC 5545 requires.

## Threat model: the relay
The relay is the only piece that can spend money or reach a phone, so it is designed as if its URL and shared secret were public.

**A secret in the browser bundle is not a secret.** `VITE_RELAY_SECRET` is compiled into the PWA, so anyone who can load a relay-mode build can read it. It only keeps out drive-by traffic. Every protection that matters is on the server.

| Threat | What an attacker would do | Control |
|---|---|---|
| Open SMS gateway | POST `/page` or `/schedule` with their own `to` and text, using the relay's paid number | The relay texts only `RELAY_PAGER_NUMBER` from its own configuration; `to` is ignored and schedule payloads carry no number |
| Toll fraud or spam to the owner | Replay requests to flood the configured phone | Daily caps: `RELAY_DAILY_PAGE_CAP` distinct pages (the beep budget) and `RELAY_SENDS_PER_PAGE` texts per page, reset at local midnight; 429 past the cap |
| Secret guessing by timing | Measure response times to recover the secret byte by byte | `crypto.timingSafeEqual` on SHA-256 digests of both values |
| Cross-site use | Make a visitor's browser call the relay from another site | No wildcard CORS; an `Origin` other than `RELAY_ALLOWED_ORIGIN` is refused with 403 |
| Schedule flooding | Create thousands of schedules far in the future | At most 64 beeps per request, each due within 48 hours, numeric codes only |
| Cost runaway | Any of the above at volume | AWS End User Messaging monthly spend limit and an AWS Budgets alarm as account-level backstops |

**Known limits.** The cap ledger is in memory, so it resets when Lambda starts a new execution environment; a DynamoDB conditional counter can replace it behind `SendLedger`. Requests without an `Origin` header (scripts, not browsers) are checked by the secret only. Multi-user use needs real sign-in (Amazon Cognito) in place of the shared secret.

## Error handling
- Storage blocked or full: the pager keeps working in memory.
- Travel adapter error: the commitment uses the default travel time.
- Notification permission denied: in-app LCD, chirp and live region still page.
- Unknown TZID or rule: imported with the fallback zone or first occurrence, with a warning.
- Relay: 401 without the secret, 403 for a browser origin that is not allowed, 503 if unconfigured or without a pager number, 400 on bad input, 404 for an unknown path or an address with no result, 429 past the daily page cap, 501 when geocoding is not configured, 502 with the AWS error name.
- Geocoder error or no result: the typed place keeps no coordinates and uses the default travel time.
- Suggestions: nothing is ever changed without Apply; dismissed routines stay hidden.

## Correctness properties
Each property must hold for every input, not only the examples in the unit tests. `tests/unit/properties.test.ts` checks them with fast-check against generated days: 0 to 12 commitments between 6 AM and 10 PM, mixing appointments and focus blocks, real, virtual and missing places, prep times from 0 to 45 minutes, every priority, all-day entries, check-in cadences, budgets from 1 to 8, buffers of 0 to 10 minutes and honesty factors of 1 to 1.5. On a failure fast-check shrinks the input to a minimal counterexample.

| Property | Criteria |
|---|---|
| **The silence budget is never exceeded.** No local day has more beeping, budget-counted pages than the daily budget, and low-priority or all-day commitments never beep. | 3.1, 3.4 |
| **ACK stops every repeat.** For any page and any ACK at or after its first beep, no alert of that page falls after the ACK. | 2.1, 2.2 |
| **The plan is deterministic.** The same commitments and settings give the same plan, in the same order, whatever order the commitments arrive in. | 1.10 |
| **Nothing pages at an event's start.** Every beeping page of an appointment fires before its start time. | 1.1, 1.9 |
| **The learner never adds a page.** Applying every prep-time suggestion to the commitments it names gives a plan with no page id that was not already there. | 9.6 |

The properties found two bugs the examples had missed, both fixed with a regression test beside the examples:
- With the buffer set to 0, a video call with no prep paged JOIN NOW at its start time. The leave-now page now always leads the start by at least `MIN_LEAVE_LEAD_MIN` (2 minutes).
- A suggestion listed every appointment of a routine, including ones with no prep time, so applying it could create a get-ready page. Suggestions now list only appointments that already have one.

## Testing strategy
- Properties (fast-check): the five correctness properties above.
- Unit (Vitest): zoned time and DST, lead times, honesty factor, escalation, ACK, coalescing, stale pages, budget ranking and pinning, digest timing, body double, determinism, .ics parsing and recurrence, import matching and merge, the prep-time learner (no history, on-time ACKs, 2 of 3 late, missed pages, rounding, one suggestion per routine, determinism), adapters with stubbed fetch and notification hosts, the local and relay geocoders, the typed-address helpers, relay with stubbed AWS clients including `/geocode`.
- End to end (Playwright, production build, America/Chicago): add a commitment, time-travel, see 411 then 911 with the right text, ignore it and see 911 911, ACK by button and key; missed page shown as 666; budget and digest; body double; .ics import and re-import; 900x run that pauses on the page; reload persistence; keyboard tabs; phone layout with the docked ACK; axe-core WCAG 2.1 AA scan; reduced motion stops animation but keeps the page; two late ACKs of a routine produce a prep suggestion that Apply turns into an earlier get-ready page, with zero axe violations; typed addresses with and without a saved match; the one-press demo day (sample load, 900x run, ACK resumes); the LCD line starts at the left edge and scrolls only when it overflows; the service worker shows a page as a notification with an ACK action and relays that ACK to the app (full Chromium in new headless mode, which grants notification permission); and the app shell opens offline.
