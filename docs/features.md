# Features

Everything Revenant does today, how the parts fit, and the switches for running and demoing it. The [README](../README.md) has the short version.

## Everything that works today
- **Pages at the moment to act.** Leave-now = start - travel - buffer. Get-ready = leave-now - prep x an honesty factor (default x1.5, because "10 minutes" is never 10 minutes).
- **Travel from where you will be.** Straight-line distance at a per-mode speed, chained from the previous appointment if it ends within three hours, else from home. Video calls say `JOIN` with no travel.
- **Typed addresses get real travel times.** An address typed on the add form that matches no saved place becomes a place and is looked up once. By default only saved places are known, so an unknown address keeps the default travel time and coordinates are never invented; with the relay, Amazon Location Service Places finds them.
- **Escalation until ACK.** Unanswered pages repeat at +3, +6 and +10 minutes (`911 911`, `911 911 911`) and stop at the cutoff. ACK cancels every later repeat. Missed pages come back from message memory as `666`.
- **Pages you ignore come back to haunt you.** Once the day is over, anything you missed returns as one silent `666` recap ("HAUNTING: 2 SLIPPED TODAY ..."): the LCD glitches, the moon bleeds red and the fog thickens. It never beeps and never touches the budget. On the day sheet, missed pages get a tombstone stamp, `RIP 9:25`, and a **Resurrect** button. At 7 AM the next morning the pager asks `666 YESTERDAY: DENTIST CLEANING. REBOOK?` and will not be ACK'd away: **Rebook** books a 15-minute call paged as `121`, **Let it go** lays it to rest. After the demo's receipt, "See what happens if you ignore it" replays the day with the dentist ignored to show the whole path.
- **A strict silence budget.** At most N beeping pages per local day (default 6), ranked must > normal, leave-now > focus > get-ready. Cut and low-priority items go into one silent `100` digest.
- **Learns from late ACKs.** If the leave-now page for a routine (the same title at the same place) was ACK'd late, or missed, in 2 of the last 3 times, the day sheet suggests more prep: "You often ACK this one late. Try 40 min prep instead of 30." Nothing changes until you press Apply, and Dismiss hides it. It moves the existing get-ready page and never adds a beep.
- **Body double.** Focus blocks page `121` to start, check in on a cadence ("STILL ON QUARTERLY TAXES? 95 MIN LEFT") and `200` to wrap up.
- **Calendar import.** Drop an .ics file: UTC, TZID and floating times, all-day events, DAILY/WEEKLY/MONTHLY rules with INTERVAL, COUNT, UNTIL, EXDATE and RECURRENCE-ID, cancelled events, Windows time-zone names, GEO. Locations match saved places; video links become online. Re-import updates in place and keeps your tuned prep times.
- **Time zones done properly.** All math is in elapsed minutes; days, labels and the digest follow your IANA zone, including 23- and 25-hour DST days.
- **Time you can see.** A 6 AM-to-midnight day bar under the clock with a tick per page and a moving playhead, a red "now" line across the day sheet, and the screen's edges glowing ember while a `911` beeps.
- **Time machine.** Pause, +5/+15/+60 min, jump to the next page, 1x/60x/900x, and "Run the day from 6 AM", which stops on the exact minute a page fires. Travelling back replays the day exactly.
- **One-press demo.** "Watch a day (60 s)" loads the sample day if the pager is empty and runs it from 6 AM at 900x. It stops on each page. On a budgeted beep, ACK keeps the day running; a page outside the budget (the digest, a check-in, a wrap-up) holds for 1.5 seconds and carries on by itself, so the viewer presses ACK six times, once per beep on the receipt. An end-to-end test holds the run to at most 7 presses and 75 seconds. Two earlier weeks of the same dinner, labelled "sample history" in the app, give the learner something to learn from, and the run ends on an end-of-day receipt.
- **It powers on like a 1990s pager.** A plain visit opens on a two-second boot: dark glass, two backlight flickers, `88888`, then `07734` (hELLO upside down). Reduced motion and the test and demo switches skip it; `?boot` asks for it.
- **It buzzes.** On phones that support vibration, each page vibrates in the rhythm of its chirp, longer as it repeats.
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
| `666` | Missed: a page nobody answered, the end-of-day haunting that lists them, and the next morning's "REBOOK?". |
| `07734` | hELLO (turn it upside down). |

## Adapters: local by default, AWS when switched on
The engine is pure: each tick the app asks it "given these pages, these ACKs and this instant, what should have beeped?" and delivers only what it has not delivered before. Everything outside the engine sits behind a port with a free local adapter and an optional real one.

| Port | Local (default, free) | Real (AWS) | Switch |
|---|---|---|---|
| Clock | `SimClock` with pause, jump and speed | the same clock at 1x | `?at=`, `?speed=` |
| Travel time | straight-line distance x 1.3 at a per-mode speed | Amazon Location Service `CalculateRoutes` via the relay | `VITE_TRAVEL=local\|relay` |
| Address lookup | saved places only, never invents coordinates | Amazon Location Service Places `Geocode` via the relay | `VITE_TRAVEL=local\|relay` |
| Out-of-app pages | Web Notifications + service worker, with an ACK action | SMS via AWS End User Messaging, with each future beep handed to a self-deleting EventBridge Scheduler schedule | `VITE_CHANNEL=browser\|relay` |
| Storage | `localStorage`, guarded | same port | none |

**Real (AWS) status:** the relay is built and unit-tested against stub AWS clients, and hardened before deploy (server-side destination, daily caps, constant-time secret, origin check; threat model in the spec's `design.md`). It has not been deployed yet, and `/geocode` waits on one SDK package. Details in [`docs/real-path.md`](docs/real-path.md).

Relay details, endpoints, limits and costs: [`real-path.md`](real-path.md).

## Run and demo switches
Demo switches: `?boot` plays the power-on sequence, `/?sample` loads an invented sample day, `?at=2026-11-19T06:00` starts the clock paused at that wall time, `?tz=America/Chicago` sets the zone, `?speed=900` runs fast, `?fresh` clears saved state.

Production build: `npm run build` writes a static site to `dist/`; `npm run preview` serves it on port 3151. The PWA is a static site and can be served from Cloudflare Pages or any static host.

Media: with the preview running, `node scripts/capture-media.mjs http://localhost:3151` recaptures `docs/media/` and the social card `public/og.png` (the GIF needs ffmpeg).
