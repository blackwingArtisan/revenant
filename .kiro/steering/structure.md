---
inclusion: always
---
# Repository structure

```
src/
  engine/            pure paging engine (no I/O)
    time.ts          IANA time-zone arithmetic, DST-safe
    types.ts         Commitment, Place, Settings, PlannedPage, Alert
    codes.ts         numeric pager codes and the wallet code card
    travel.ts        straight-line travel estimate, origin chaining
    plan.ts          commitments -> pages: lead times, budget, digest, body double
    alerts.ts        escalation: which beeps have happened by a given instant
    learn.ts         prep-time suggestions from late ACKs (advisory, pure)
    runtime.ts       delivery state: tick, acknowledge, rewind
    ics.ts           iCalendar reader (RRULE, EXDATE, RECURRENCE-ID, TZID)
    importer.ts      calendar events -> commitments, place matching, merge
    sample.ts        invented sample places, settings and day
    sample-ics.ts    invented sample calendar export
  adapters/          ports with local and real implementations
    clock.ts, travel.ts, geocode.ts, channel.ts, storage.ts, resolve-travel.ts, schedule-sync.ts, select.ts
  relay/             real path only: AWS Lambda (Location routes and Places, SMS, Scheduler)
  app/               React PWA
    index.html, main.tsx, App.tsx, usePager.ts, beep.ts, styles.css
    components/      Pager, TimeMachine, DaySheet, PrepAdvice, AddForm, ImportPanel, SettingsPanel, CodeCard
public/              service worker, manifest, icons
tests/
  unit/              Vitest: engine, ics, adapters, relay
  e2e/               Playwright: the real app in Chromium (desktop and phone)
  fixtures/          invented .ics files
docs/                architecture and real-path notes
.kiro/               steering, specs, hooks
```

## Conventions
- A new page kind needs: a code in `codes.ts`, a candidate rule in `plan.ts`, a budget decision, a unit test, and a row on the wallet code card.
- A new external service needs a port in `src/adapters`, a local implementation used by tests, and a real implementation that is type-checked but not called by tests.
- A feature that changes the plan must say which page it replaces or why the daily budget still holds (the learner only moves an existing get-ready page).
- Engine tests use `tests/unit/helpers.ts` (`at(day, h, m)` in America/Chicago) so expected times read like a calendar.
