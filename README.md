# Revenant

**The 1990s pager, back from the dead for ADHD brains: it stays silent all day and goes off only at the moment you have to act.**

Revenant is a PWA that looks and behaves like a belt pager: a green backlit LCD, chunky rubber buttons, a chirp, numeric codes. You give it your commitments (typed in, or imported from an .ics calendar export) with where they are and how long getting ready *really* takes. It pages `411` when it is time to get ready and `911` when it is time to walk out the door, repeats `911 911` until you press ACK, and never beeps more than a fixed number of times a day. Everything else goes into one quiet digest.

Kiroween 2026, category **Resurrection**.

## Who it is for
Adults with ADHD and anyone with time blindness. The problem is rarely forgetting the appointment; it is that "dentist at 10:30" never turns into "stand up now". Phone reminders fire when the event *starts*, all at the same volume as a hundred other notifications, and get swiped away. A pager was trusted because it was almost always silent.

**Why it matters**
- About 15.5 million US adults, 1 in 16, reported a current ADHD diagnosis in 2023, and more than half were diagnosed as adults ([CDC, *MMWR* 73(40), 2024](https://www.cdc.gov/mmwr/volumes/73/wr/mm7340a1.htm)).
- Across 105 studies, the average appointment no-show rate is about 23% ([Dantas et al., *Health Policy* 122(4), 2018](https://ideas.repec.org/a/eee/hepoli/v122y2018i4p412-421.html)). Every missed slot costs the clinic the hour and the patient the care.

## What works today
- **Pages at the moment to act.** Leave-now = start - travel - buffer. Get-ready = leave-now - prep x an honesty factor (default x1.5, because "10 minutes" is never 10 minutes).
- **Travel from where you will be.** Straight-line distance at a per-mode speed, chained from the previous appointment if it ends within three hours, else from home. Video calls say `JOIN` with no travel.
- **Typed addresses get real travel times.** An address typed on the add form that matches no saved place becomes a place and is looked up once. By default only saved places are known, so an unknown address keeps the default travel time and coordinates are never invented; with the relay, Amazon Location Service Places finds them.
- **Escalation until ACK.** Unanswered pages repeat at +3, +6 and +10 minutes (`911 911`, `911 911 911`) and stop at the cutoff. ACK cancels every later repeat. Missed pages come back from message memory as `666`.
- **A strict daily budget.** At most N beeping pages per local day (default 6), ranked must > normal, leave-now > focus > get-ready. Cut and low-priority items go into one silent `100` digest.
- **Learns from late ACKs.** If the leave-now page for a routine (the same title at the same place) was ACK'd late, or missed, in 2 of the last 3 times, the day sheet suggests more prep: "You often ACK this one late. Try 25 min prep instead of 15." Nothing changes until you press Apply, and Dismiss hides it. It moves the existing get-ready page and never adds a beep.
- **Body double.** Focus blocks page `121` to start, check in on a cadence ("STILL ON QUARTERLY TAXES? 95 MIN LEFT") and `200` to wrap up.
- **Calendar import.** Drop an .ics file: UTC, TZID and floating times, all-day events, DAILY/WEEKLY/MONTHLY rules with INTERVAL, COUNT, UNTIL, EXDATE and RECURRENCE-ID, cancelled events, Windows time-zone names, GEO. Locations match saved places; video links become online. Re-import updates in place and keeps your tuned prep times.
- **Time zones done properly.** All math is in elapsed minutes; days, labels and the digest follow your IANA zone, including 23- and 25-hour DST days.
- **Time machine.** Pause, +5/+15/+60 min, jump to the next page, 1x/60x/900x, and "Run the day from 6 AM", which stops on the exact minute a page fires. Travelling back replays the day exactly.
- **One-press demo.** "Watch a day in about a minute" loads the sample day if the pager is empty and runs it from 6 AM at 900x. It stops on each page; ACK keeps the day running. Two earlier weeks of the same dinner, labelled "sample history" in the app, give the learner something to learn from, and the run ends on a receipt: "That was your day: 6 beeps, 4 kept quiet in the digest, 0 missed."
- **A readable LCD.** A message that fits sits still. A longer one shows its start, holds, scrolls to its end and repeats.
- **Lock-screen pages.** With notifications allowed, the service worker shows each page with an ACK action that acknowledges it in the app.
- **Accessible.** Every page is announced through an assertive live region; all controls work from the keyboard (A = ACK, R = READ, M = mute, N = next page); visible focus; zero axe-core WCAG 2.1 A/AA violations in the end-to-end suite; `prefers-reduced-motion` gives a still pager. On a phone, a docked mini pager with a large ACK button appears when the device is scrolled away.
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

A one-minute demo: open the app and press **Watch a day in about a minute**, then press **ACK** (or `A`) each time it stops on a page.

Production build: `npm run build` writes a static site to `dist/`; `npm run preview` serves it on port 3151.

## How to test
```sh
npm run check      # TypeScript typecheck + Vitest unit tests
npx playwright install chromium   # once
npm run test:e2e   # Playwright against the production build (desktop + phone)
```

- **Unit (Vitest, 144 tests):** wallet code card, time zones and DST, lead times, honesty factor, origin chaining, escalation, ACK, coalescing after a jump, stopping a fast run on the first beep, stale pages, budget ranking and pinning, digest timing, body double, determinism, the prep-time learner, the local and relay geocoders, typed addresses, .ics parsing and recurrence, import and merge, adapters, the remote schedule diff, and the relay (routes, geocoding, SMS, schedules, and its hardening: server-side destination, daily caps, constant-time secret, origin check) against stub AWS clients.
- **End to end (Playwright, 20 tests):** adds a dentist appointment, time-travels, sees `411` then `911` with the right text and beep count, ignores it and sees `911 911`, ACKs by button and keyboard; a missed page read back as `666`; budget and digest; body double; .ics import and re-import; a 900x run that pauses on the page; persistence across reload; keyboard tabs; phone layout with the docked ACK; an axe-core WCAG 2.1 AA scan of every console tab while paging; reduced motion; the one-press demo day with the learner's card from labelled sample history, and its end-of-day receipt; two late ACKs producing a prep suggestion that Apply turns into an earlier get-ready page; typed addresses with and without a saved match; the LCD line starting at its left edge and scrolling only when it overflows; the service worker showing a page as a notification with an ACK action and relaying that ACK to the app; and the app shell opening offline.

## Architecture
```
src/engine     pure, deterministic paging engine (no I/O, no Date.now)
  time.ts        IANA zone math, DST gap/overlap rules
  plan.ts        commitments -> pages: lead times, budget, digest, body double
  alerts.ts      escalation as a pure function of (page, ack, now)
  learn.ts       prep-time suggestions from late ACKs (advisory, pure)
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
| Address lookup | saved places only, never invents coordinates | Amazon Location Service Places (GeoPlaces `Geocode`) via the relay's `/geocode`; not enabled until `@aws-sdk/client-geo-places` is added (answers 501) | `VITE_TRAVEL=local\|relay` (same switch as travel) |
| Out-of-app pages | Web Notifications + service worker, with an ACK action | SMS via AWS End User Messaging; every future beep handed to self-deleting EventBridge Scheduler schedules, so pages go out with the app closed | `VITE_CHANNEL=browser\|relay` |
| Storage | `localStorage`, guarded | same port | none |

See `.env.example` for every setting and `docs/real-path.md` for the relay's endpoints and setup. The browser never holds AWS credentials.

**Deploy target (free):** the PWA is a static site; `dist/` can be served from Cloudflare Pages or any static host. Not deployed from this repository.

## Built with Kiro
Revenant is specified and steered in Kiro's format. See [`/.kiro`](.kiro) for the steering files (product, tech, structure), the `time-blind-paging` spec (EARS requirements, design, tasks) and the hooks (`.kiro/hooks/*.json`: unit tests on save, a paging-rules guard, a code-card check and a typecheck on stop), and [`KIRO-LOG.md`](KIRO-LOG.md) for how they were produced and used.

## Credits
Fonts are self-hosted through Fontsource: VT323, Big Shoulders Display, IBM Plex Mono and Monoton under the SIL Open Font License 1.1, and Special Elite under the Apache License 2.0. Runtime: React (MIT). AWS SDK for JavaScript v3 (Apache 2.0) is an optional dependency used only by the relay.

## License
MIT, Stubborn Otter Software. All names, places and phone numbers in the sample data are invented.
