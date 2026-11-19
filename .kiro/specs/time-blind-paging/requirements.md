# Requirements: Time-blind paging

## Introduction
Revenant pages a person with ADHD only when they need to act: get ready, leave, start, wrap up. This spec covers the paging engine (lead times, escalation, daily budget, digest, body double), calendar import, the pager interface, the time machine used for demos and tests, and the adapters for travel time and out-of-app delivery.

## Glossary
- **User**: the person carrying the pager.
- **Commitment**: something the user must show up for (appointment) or work on (focus block), with a start, an end, an optional place, a prep time and a priority.
- **Page**: one planned beep with a numeric code, a short LCD text and a fire time.
- **Alert**: one actual beep of a page; level 0 is the first, level 1 and up are repeats.
- **ACK**: the user's acknowledgement of a page.
- **Cutoff**: the instant after which a page is moot (for leave-now, the start of the commitment).
- **Budget**: the most beeping pages allowed in one local day.
- **Digest**: one silent page per day listing everything that did not earn a beep.
- **Honesty factor**: multiplier applied to the user's stated prep time.

## Requirement 1: Lead times
**User story:** As a user, I want to be paged when I need to act, not when the event starts, so that I arrive on time.

1.1 WHEN an appointment has a physical place THE SYSTEM SHALL schedule a leave-now page (code 911) at the start time minus travel time minus the buffer.
1.2 WHEN an appointment has a prep time greater than zero THE SYSTEM SHALL schedule a get-ready page (code 411) at the leave-now time minus the prep time multiplied by the honesty factor.
1.3 WHEN an appointment is a video call THE SYSTEM SHALL use zero travel time and say JOIN instead of LEAVE.
1.4 WHEN the travel adapter has no estimate for a route THE SYSTEM SHALL use the default travel time from settings.
1.5 WHEN the previous physical appointment ends within three hours before an appointment THE SYSTEM SHALL estimate travel from that appointment's place instead of home.
1.6 THE SYSTEM SHALL compute every lead time in elapsed minutes, so that a daylight-saving change never moves a page relative to its commitment.
1.7 THE SYSTEM SHALL plan in the user's configured IANA time zone, not the device's.

## Requirement 2: Escalation and ACK
**User story:** As a user, I want an ignored page to come back louder until I acknowledge it, so that one glance away does not cost me the appointment.

2.1 WHILE a page is unacknowledged and before its cutoff THE SYSTEM SHALL repeat it at each escalation offset from settings, with the code repeated (911, 911 911, 911 911 911).
2.2 WHEN the user presses ACK THE SYSTEM SHALL record the acknowledgement and SHALL NOT repeat that page again.
2.3 WHEN a page reaches its cutoff without an ACK THE SYSTEM SHALL mark it missed and keep it in message memory, shown as code 666.
2.4 WHEN several repeats of one page come due at once (after a clock jump or a sleeping tab) THE SYSTEM SHALL beep once, at the highest level.
2.5 IF a page came due and went moot while the app was closed THEN THE SYSTEM SHALL NOT beep for it.
2.6 THE SYSTEM SHALL deliver each alert at most once.

## Requirement 3: Daily budget and digest
**User story:** As a user, I want a hard cap on beeps, so that I trust every beep enough to act on it.

3.1 THE SYSTEM SHALL let at most the budgeted number of pages beep per local day.
3.2 WHEN candidates exceed the budget THE SYSTEM SHALL keep pages that already beeped first, then must over normal priority, then leave-now over focus-start over get-ready, then earliest.
3.3 WHEN a page is cut by the budget THE SYSTEM SHALL list it in that day's digest as over budget.
3.4 WHEN a commitment has low priority or is all day THE SYSTEM SHALL never beep for it and SHALL list it in the digest.
3.5 WHEN a day has digest items THE SYSTEM SHALL schedule one silent digest page (code 100) at the configured digest time, or one hour before the first timed item if that is earlier, but not before the day starts.
3.6 THE SYSTEM SHALL NOT let all-day items move the digest earlier.
3.7 THE SYSTEM SHALL count local days by the user's time zone, including 23-hour and 25-hour days.

## Requirement 4: Body double
**User story:** As a user, I want a focus block to check in on me, so that I start, keep going and stop on time.

4.1 WHEN a focus block starts THE SYSTEM SHALL page code 121 and repeat it until ACK or for at most 20 minutes.
4.2 WHILE a focus block runs THE SYSTEM SHALL page a soft 121 check-in at the chosen cadence with the minutes left, without repeats.
4.3 WHEN a focus block ends THE SYSTEM SHALL page code 200 to wrap up.
4.4 THE SYSTEM SHALL count only the focus-start page against the budget, and SHALL drop the check-ins and wrap-up when the focus-start page is cut.

## Requirement 5: Calendar import
**User story:** As a user, I want to load my existing calendar, so that I do not retype my week.

5.1 WHEN the user selects or drops an .ics file THE SYSTEM SHALL read it in the browser without uploading it.
5.2 THE SYSTEM SHALL read UTC, TZID and floating times, all-day dates, DTEND or DURATION, folded lines and escaped text.
5.3 THE SYSTEM SHALL expand DAILY, WEEKLY (with BYDAY) and MONTHLY rules with INTERVAL, COUNT and UNTIL, honor EXDATE and RECURRENCE-ID overrides, and keep recurring events at the same wall-clock time across daylight-saving changes.
5.4 THE SYSTEM SHALL skip cancelled events and ignore nested components such as alarms.
5.5 WHEN a location matches a saved place by name or address THE SYSTEM SHALL use that place; WHEN it is a video link THE SYSTEM SHALL use the online place; WHEN it has GEO coordinates THE SYSTEM SHALL create a place with them; otherwise THE SYSTEM SHALL create a place without coordinates.
5.6 WHEN the same file is imported again THE SYSTEM SHALL update the events in place and keep the prep time and priority the user tuned.
5.7 IF a time zone, rule or file cannot be read THEN THE SYSTEM SHALL import what it can and show a plain warning.

## Requirement 6: The pager
**User story:** As a user, I want a device that looks and behaves like a pager, so that a page is unmistakable.

6.1 WHEN a page beeps THE SYSTEM SHALL light the LCD, show the code and scrolling text, blink the LED, play a synthesized chirp (unless muted) and vibrate where supported.
6.2 THE SYSTEM SHALL announce every page to assistive technology through a live region.
6.3 THE SYSTEM SHALL provide ACK, READ (message memory) and MUTE buttons, also on the keys A, R and M.
6.4 WHEN notifications are allowed THE SYSTEM SHALL show each beeping page as a lock-screen notification with an ACK action that acknowledges the page in the app.
6.5 WHEN a page is beeping and the pager is scrolled out of view THE SYSTEM SHALL show a docked mini pager with an ACK button.
6.6 WHERE the user prefers reduced motion THE SYSTEM SHALL show pages without shaking, blinking or scrolling text.
6.7 THE SYSTEM SHALL keep commitments, places, settings, acknowledgements and message memory across reloads on the same device.

## Requirement 7: Time machine
**User story:** As a presenter or tester, I want to drive the clock, so that a whole day can be shown in a minute.

7.1 THE SYSTEM SHALL let the user pause the clock, jump ahead by 5, 15 or 60 minutes, jump to the next beep, and run at 1x, 60x or 900x.
7.2 WHEN the clock runs faster than real time and a page fires THE SYSTEM SHALL pause at the exact page time (option on by default).
7.3 WHEN the user travels back in time THE SYSTEM SHALL forget beeps and ACKs that had not happened yet, so the day replays exactly.
7.4 THE SYSTEM SHALL accept `?at=`, `?speed=`, `?tz=`, `?sample` and `?fresh` URL switches for demos and tests.

## Requirement 8: Adapters and the real path
**User story:** As an operator, I want real routing and SMS behind the same interfaces, so that the free local demo and the production path share all logic.

8.1 THE SYSTEM SHALL use the free local travel estimate and browser notifications by default.
8.2 WHERE `VITE_TRAVEL=relay` and a relay URL is set THE SYSTEM SHALL get travel times from Amazon Location Service through the relay, with the departure time.
8.3 WHERE `VITE_CHANNEL=relay` and a relay URL and number are set THE SYSTEM SHALL send pages as SMS through Amazon End User Messaging via the relay, and withdraw pending repeats on ACK.
8.4 WHEN the relay receives a schedule request THE SYSTEM SHALL create one self-deleting EventBridge Scheduler schedule per beep, so pages go out with the browser closed.
8.5 IF the relay has no shared secret configured, or a request lacks it, THEN THE SYSTEM SHALL refuse the request.
8.6 THE SYSTEM SHALL never send AWS credentials to the browser.
