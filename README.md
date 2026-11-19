# Revenant

**The 1990s pager, back from the dead for ADHD brains: it stays silent all day and goes off only at the moment you have to act.**

Revenant is a PWA that looks and behaves like a belt pager: a green backlit LCD, chunky rubber buttons, a chirp, numeric codes. You give it your commitments (typed in, or imported from an .ics calendar export) with where they are and how long getting ready *really* takes. It pages `411` when it is time to get ready and `911` when it is time to walk out the door, repeats `911 911` until you press ACK, and never beeps more than a fixed number of times a day. Everything else goes into one quiet digest.

Kiroween 2026, category **Resurrection**.

## Who it is for
Adults with ADHD and anyone with time blindness. The problem is rarely forgetting the appointment; it is that "dentist at 10:30" never turns into "stand up now". Phone reminders fire when the event *starts*, all at the same volume as a hundred other notifications, and get swiped away. A pager was trusted because it was almost always silent.

## What works today
- **Pages at the moment to act.** Leave-now = start - travel - buffer. Get-ready = leave-now - prep x an honesty factor (default x1.5, because "10 minutes" is never 10 minutes).
- **Travel from where you will be.** Straight-line distance at a per-mode speed, chained from the previous appointment if it ends within three hours, else from home. Video calls say `JOIN` with no travel.
- **Escalation until ACK.** Unanswered pages repeat at +3, +6 and +10 minutes (`911 911`, `911 911 911`) and stop at the cutoff. ACK cancels every later repeat. Missed pages come back from message memory as `666`.
- **A strict daily budget.** At most N beeping pages per local day (default 6), ranked must > normal, leave-now > focus > get-ready. Cut and low-priority items go into one silent `100` digest.
- **Body double.** Focus blocks page `121` to start, check in on a cadence ("STILL ON QUARTERLY TAXES? 95 MIN LEFT") and `200` to wrap up.
- **Calendar import.** Drop an .ics file: UTC, TZID and floating times, all-day events, DAILY/WEEKLY/MONTHLY rules with INTERVAL, COUNT, UNTIL, EXDATE and RECURRENCE-ID, cancelled events, Windows time-zone names, GEO. Locations match saved places; video links become online. Re-import updates in place and keeps your tuned prep times.
- **Time zones done properly.** All math is in elapsed minutes; days, labels and the digest follow your IANA zone, including 23- and 25-hour DST days.
- **Time machine.** Pause, +5/+15/+60 min, jump to the next page, 1x/60x/900x, and "Run the day from 6 AM", which stops on the exact minute a page fires. Travelling back replays the day exactly.
- **Lock-screen pages.** With notifications allowed, the service worker shows each page with an ACK action that acknowledges it in the app.
- **Accessible.** Every page is announced through an assertive live region; all controls work from the keyboard (A = ACK, R = READ, M = mute, N = next page); visible focus; high-contrast text; `prefers-reduced-motion` gives a still pager. On a phone, a docked mini pager with a large ACK button appears when the device is scrolled away.
- **Offline and private.** The service worker caches the app shell for offline use. Everything stays in this browser's storage.

## Codes
| Code | Meaning |
|---|---|
| `411` | Get ready. Shoes, keys, meds. |
| `911` | Leave now to arrive on time. |
| `911 911` | Still here? Unanswered pages repeat until ACK. |
| `121` | Body double: start, or check in on, a focus block. |
| `200` | Wrap up: the focus block is over. |
| `100` | Digest: one quiet page with everything that did not earn a beep. |
| `666` | Missed: a page nobody answered. |
| `07734` | hELLO (turn it upside down). |

## How to run
Requires Node 22 or later.

```sh
npm ci
npm run dev        # http://localhost:3150
```

Demo switches: `/?sample` loads an invented sample day, `?at=2026-11-19T06:00` starts the clock paused at that wall time, `?tz=America/Chicago` sets the zone, `?speed=900` runs fast, `?fresh` clears saved state.

A one-minute demo: open `/?sample&at=2026-11-19T06:00&tz=America/Chicago`, press **Run the day from 6 AM**, and press **ACK** (or `A`) each time it stops on a page.

Production build: `npm run build` writes a static site to `dist/`; `npm run preview` serves it on port 3151.

## How to test
```sh
npm run check      # TypeScript typecheck + Vitest unit tests
npx playwright install chromium   # once
npm run test:e2e   # Playwright against the production build (desktop + phone)
```

- **Unit (Vitest, 84 tests):** time zones and DST, lead times, honesty factor, origin chaining, escalation, ACK, coalescing after a jump, stale pages, budget ranking and pinning, digest timing, body double, determinism, .ics parsing and recurrence, import and merge, adapters, and the relay against stub AWS clients.
- **End to end (Playwright, 9 tests):** adds a dentist appointment, time-travels, sees `411` then `911` with the right text and beep count, ignores it and sees `911 911`, ACKs by button and keyboard; a missed page read back as `666`; budget and digest; body double; .ics import and re-import; a 900x run that pauses on the page; persistence across reload; keyboard tabs; phone layout with the docked ACK.

## Architecture
```
src/engine     pure, deterministic paging engine (no I/O, no Date.now)
  time.ts        IANA zone math, DST gap/overlap rules
  plan.ts        commitments -> pages: lead times, budget, digest, body double
  alerts.ts      escalation as a pure function of (page, ack, now)
  runtime.ts     deliver-once ticking, ACK, rewind
  ics.ts         iCalendar reader and recurrence expansion
  importer.ts    events -> commitments, place matching, merge
src/adapters   ports with a free local default and a real implementation
src/relay      AWS Lambda for the real path (routes, SMS, schedules)
src/app        React 19 PWA: Pager, TimeMachine, DaySheet, forms, service worker
```

The app is a thin shell: each tick it asks the engine "given these pages, these ACKs and this instant, what should have beeped?" and delivers only the alerts it has not delivered before. Because the engine is pure and the clock is injected, the same code drives the real clock, the 900x demo and every test.

## Adapters (local vs real)
| Port | Local (default, free) | Real (written and type-checked, not run here) | Switch |
|---|---|---|---|
| Clock | `SimClock` with pause, jump and speed | the same clock at 1x | `?at=`, `?speed=` |
| Travel time | straight-line distance x 1.3 at per-mode speed | Amazon Location Service `CalculateRoutes` via the relay | `VITE_TRAVEL=local\|relay` |
| Out-of-app pages | Web Notifications + service worker, with an ACK action | SMS via AWS End User Messaging; repeats as self-deleting EventBridge Scheduler schedules | `VITE_CHANNEL=browser\|relay` |
| Storage | `localStorage`, guarded | same port | none |

See `.env.example` for every setting and `docs/real-path.md` for the relay's endpoints and setup. The browser never holds AWS credentials.

**Deploy target (free):** the PWA is a static site; `dist/` can be served from Cloudflare Pages or any static host. Not deployed from this repository.

## Built with Kiro
Revenant is specified and steered in Kiro's format. See [`/.kiro`](.kiro) for the steering files (product, tech, structure), the `time-blind-paging` spec (EARS requirements, design, tasks) and the agent hooks, and [`KIRO-LOG.md`](KIRO-LOG.md) for how they were produced and used.

## License
MIT, Stubborn Otter Software. All names, places and phone numbers in the sample data are invented.
