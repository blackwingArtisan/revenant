---
inclusion: always
---
# Product: Revenant

**One line:** The pager, back from the dead for ADHD brains. It only goes off when you need to act.

**The thesis.** Phones failed people with ADHD: a hundred notifications a day, all the same volume, all ignorable, and every one of them fires when an event *starts*, which is exactly when it is too late. A 1990s pager did the opposite. It was silent almost all the time, so when it went off you looked. Revenant brings that back: a few numeric pages a day ("411" get ready, "911" leave now), each timed to the moment you must act, repeating until you press ACK.

## Who it is for
Adults with ADHD (and anyone with time blindness) who miss appointments not because they forgot, but because "the appointment is at 10:30" never turns into "stand up now". Parents juggling pickups. Freelancers whose day is a string of calls and errands. People who have tried every reminder app and learned to swipe them all away.

## What Revenant does
1. **Pages at the moment to act.** For each commitment it computes a get-ready page (411) and a leave-now page (911) from travel time, a buffer, and the user's own honest prep time.
2. **Corrects for time blindness.** Stated prep time is multiplied by an honesty factor (default x1.5). Travel is estimated from the place the user will actually be, including the previous appointment.
3. **Escalates like a real pager.** An unanswered page repeats ("911 911", "911 911 911") on a fixed cadence until ACK, and stops the moment it becomes moot.
4. **Keeps a strict budget.** At most N beeping pages per local day (default 6). Everything else goes into one silent digest page. Low-priority items never beep.
5. **Body doubles.** A focus block pages at its start (121), checks in on a cadence, and pages a wrap-up (200).
6. **Imports a calendar.** A local .ics file (Google, Apple, Outlook exports) becomes commitments, matched to saved places.
7. **Demos a whole day in a minute.** A time machine (pause, jump, next page, 900x) drives the same engine the real clock drives.

## Product rules (non-negotiable)
- **Fewer pages beat more pages.** Any feature that adds a page must say which page it replaces or why the budget still holds.
- **Page at the action, never at the start.** No page may fire at an event's start time unless the action is "start" (a focus block or a video call).
- **Deterministic.** The same commitments, settings and clock always give the same pages. No randomness and no `Date.now()` in the engine.
- **Private by default.** Everything runs in the browser and stays in local storage. Nothing leaves the device unless the user opts into the relay.
- **Accessible.** Every page is announced to screen readers, every control works from the keyboard, and reduced-motion users get a still pager with the same information.

## Voice and look
A pager on a belt at midnight. Green backlit LCD (VT323), chunky rubber buttons, a red LED, a greenbar dot-matrix day sheet, a VCR time machine and a laminated wallet code card. Spooky, not gory: the LCD is "haunted" by faint ghosts of earlier pages, and unanswered pages come back from memory as 666. Copy is short, plain and kind; it never shames the user for a missed page.

## Sample data
Invented names and places only ("Hollow Creek", "13 Raven Row"), 555-01xx phone numbers, example.com addresses.
