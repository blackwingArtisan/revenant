# Requirements: Time-blind paging

## Introduction
Revenant pages a person with ADHD only when they need to act: get ready, leave, start, wrap up. This spec covers the paging engine (lead times, escalation, daily budget, digest, body double), calendar import, the pager interface, the time machine used for demos and tests, the adapters for travel time, address lookup and out-of-app delivery, and the learner that suggests a longer prep time.

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
- **Routine**: commitments with the same title at the same place. The learner treats them as one thing the user does repeatedly, because each commitment has only one leave-now page.
- **Late ACK**: a leave-now page acknowledged at alert level 1 or later (the second beep or later), acknowledged after its cutoff, or never acknowledged before its cutoff.
- **Geocoder**: the adapter that turns a typed address into coordinates.

All acceptance criteria use the EARS forms: `WHEN <event>, THE SYSTEM SHALL ...`, `WHILE <state>, THE SYSTEM SHALL ...`, `IF <condition> THEN THE SYSTEM SHALL ...` and `WHERE <feature is present>, THE SYSTEM SHALL ...`, each stating one testable behavior. Existing numbers are stable; criteria added in a later review are appended at the end of their requirement.


## Requirement 1: Lead times
**User story:** As a user, I want to be paged when I need to act, not when the event starts, so that I arrive on time.

1.1 WHEN an appointment has a physical place, THE SYSTEM SHALL schedule a leave-now page (code 911) at the start time minus the travel time minus the buffer.
1.2 WHEN an appointment has a prep time greater than zero, THE SYSTEM SHALL schedule a get-ready page (code 411) at the leave-now time minus the prep time multiplied by the honesty factor.
1.3 WHEN an appointment is a video call, THE SYSTEM SHALL use zero travel time.
1.4 WHEN the travel adapter has no estimate for a route, THE SYSTEM SHALL use the default travel time from settings.
1.5 WHEN the previous physical appointment ends within three hours before an appointment, THE SYSTEM SHALL estimate travel from that appointment's place instead of home.
1.6 WHEN a daylight-saving change falls between a page and its commitment, THE SYSTEM SHALL measure the lead time in elapsed minutes, so that the page keeps the same distance from the commitment.
1.7 WHILE a time zone is set in settings, THE SYSTEM SHALL compute days, day boundaries, the digest time and page labels in that zone and not in the device's zone.
1.8 WHEN an appointment is a video call, THE SYSTEM SHALL word its page as JOIN instead of LEAVE.
1.9 WHEN a page is planned for an appointment, THE SYSTEM SHALL NOT fire it at the appointment's start time.
1.10 WHEN the same commitments, settings and clock are planned twice, THE SYSTEM SHALL produce the same pages in the same order.

## Requirement 2: Escalation and ACK
**User story:** As a user, I want an ignored page to come back louder until I acknowledge it, so that one glance away does not cost me the appointment.

2.1 WHILE a page is unacknowledged and before its cutoff, THE SYSTEM SHALL repeat it at each escalation offset from settings.
2.2 WHEN the user presses ACK, THE SYSTEM SHALL record the acknowledgement time of the page.
2.3 WHEN a page reaches its cutoff without an ACK, THE SYSTEM SHALL mark the page missed.
2.4 WHEN several repeats of one page come due at once (after a clock jump or a sleeping tab), THE SYSTEM SHALL beep once, at the highest level.
2.5 IF a page came due and went moot while the app was closed, THEN THE SYSTEM SHALL NOT beep for it.
2.6 WHEN an alert has been delivered, THE SYSTEM SHALL NOT deliver the same alert again.
2.7 WHEN a page repeats, THE SYSTEM SHALL repeat its code once more per level, up to three times (911, 911 911, 911 911 911).
2.8 WHEN a page has been acknowledged, THE SYSTEM SHALL NOT repeat it at any later escalation offset.
2.9 WHEN the user reads a missed page from message memory, THE SYSTEM SHALL show it with code 666.

## Requirement 3: Daily budget and digest
**User story:** As a user, I want a hard cap on beeps, so that I trust every beep enough to act on it.

3.1 WHEN a local day is planned, THE SYSTEM SHALL let at most the budgeted number of that day's pages beep.
3.2 WHEN the candidate pages of a local day exceed the budget, THE SYSTEM SHALL keep pages that already beeped first, then must over normal priority, then leave-now over focus-start over get-ready, then earliest.
3.3 WHEN a page is cut by the budget, THE SYSTEM SHALL list it in that day's digest as over budget.
3.4 WHEN a commitment has low priority or is all day, THE SYSTEM SHALL NOT beep for it.
3.5 WHEN a day has digest items, THE SYSTEM SHALL schedule one silent digest page (code 100) at the configured digest time, or one hour before the first timed item if that is earlier, but not before the day starts.
3.6 WHEN a day's digest holds all-day items, THE SYSTEM SHALL ignore their start times when placing the digest page.
3.7 WHEN pages are counted against the budget, THE SYSTEM SHALL count local days in the user's time zone, so that a 23-hour or 25-hour day is one day.
3.8 WHEN a commitment has low priority or is all day, THE SYSTEM SHALL list it in that day's digest.
3.9 WHEN the digest page fires, THE SYSTEM SHALL light the LCD without a beep.

## Requirement 4: Body double
**User story:** As a user, I want a focus block to check in on me, so that I start, keep going and stop on time.

4.1 WHEN a focus block starts, THE SYSTEM SHALL page code 121.
4.2 WHILE a focus block runs, THE SYSTEM SHALL page a soft 121 check-in at the chosen cadence, showing the minutes left.
4.3 WHEN a focus block ends, THE SYSTEM SHALL page code 200 to wrap up.
4.4 WHEN a focus block is planned, THE SYSTEM SHALL count only its focus-start page against the budget.
4.5 WHILE a focus-start page is unacknowledged and less than 20 minutes after the block's start, THE SYSTEM SHALL repeat it at the escalation offsets.
4.6 IF the focus-start page is cut by the budget, THEN THE SYSTEM SHALL drop that block's check-ins and wrap-up.
4.7 WHEN a check-in page fires, THE SYSTEM SHALL NOT repeat it.

## Requirement 5: Calendar import
**User story:** As a user, I want to load my existing calendar, so that I do not retype my week.

5.1 WHEN the user selects or drops an .ics file, THE SYSTEM SHALL read it in the browser without uploading it.
5.2 WHEN an event has a UTC, TZID or floating start time, THE SYSTEM SHALL convert it to the matching instant.
5.3 WHEN an event has a DAILY, WEEKLY (with BYDAY) or MONTHLY rule, THE SYSTEM SHALL expand it, honoring INTERVAL, COUNT and UNTIL.
5.4 WHEN an event is cancelled, THE SYSTEM SHALL skip it.
5.5 WHEN a location matches a saved place by name or address, THE SYSTEM SHALL use that place.
5.6 WHEN the same file is imported again, THE SYSTEM SHALL update the existing events in place.
5.7 IF a time zone, rule or file cannot be read, THEN THE SYSTEM SHALL import what it can.
5.8 WHEN an event starts on a date without a time, THE SYSTEM SHALL import it as an all-day event.
5.9 WHEN an event has DTEND or DURATION, THE SYSTEM SHALL use it to set the event's end.
5.10 WHEN an event text has folded lines or escaped characters, THE SYSTEM SHALL read the unfolded and unescaped text.
5.11 WHEN a recurring event has an EXDATE or a RECURRENCE-ID override, THE SYSTEM SHALL drop the excluded occurrence or replace it with the override.
5.12 WHEN a recurring event crosses a daylight-saving change, THE SYSTEM SHALL keep each occurrence at the same wall-clock time.
5.13 WHEN an event contains nested components such as alarms, THE SYSTEM SHALL ignore them.
5.14 WHEN a location is a video link, THE SYSTEM SHALL use the online place.
5.15 WHEN a location matches no saved place and the event has GEO coordinates, THE SYSTEM SHALL create a place with those coordinates.
5.16 WHEN a location matches no saved place and the event has no GEO coordinates, THE SYSTEM SHALL create a place without coordinates.
5.17 WHEN an event is updated by a repeated import, THE SYSTEM SHALL keep the prep time and priority the user tuned.
5.18 IF a time zone, rule or file cannot be read, THEN THE SYSTEM SHALL show a plain warning.

## Requirement 6: The pager
**User story:** As a user, I want a device that looks and behaves like a pager, so that a page is unmistakable.

6.1 WHEN a page beeps, THE SYSTEM SHALL light the LCD and show the page's code and text.
6.2 WHEN a page beeps, THE SYSTEM SHALL announce it to assistive technology through a live region.
6.3 WHEN the user presses READ, THE SYSTEM SHALL show the next stored page from message memory.
6.4 WHERE notification permission is granted, WHEN a page beeps, THE SYSTEM SHALL show it as a lock-screen notification.
6.5 WHILE a page is beeping and the pager is scrolled out of view, THE SYSTEM SHALL show a docked mini pager with an ACK button.
6.6 WHERE the user prefers reduced motion, THE SYSTEM SHALL show pages without shaking, blinking or scrolling text.
6.7 WHEN the app is reloaded on the same device, THE SYSTEM SHALL restore commitments, places, settings, acknowledgements and message memory.
6.8 WHEN the LCD shows a message, THE SYSTEM SHALL show the message's first word at the left edge.
6.9 WHILE the device is offline and the app has been loaded once, THE SYSTEM SHALL open the app from the service worker cache.
6.10 WHEN a page beeps, THE SYSTEM SHALL blink the LED.
6.11 WHEN a page beeps and the pager is not muted, THE SYSTEM SHALL play a synthesized chirp.
6.12 WHERE the device supports vibration, WHEN a page beeps, THE SYSTEM SHALL vibrate the device.
6.13 WHEN the user presses MUTE, THE SYSTEM SHALL toggle the chirp.
6.14 WHEN the user presses ACK, THE SYSTEM SHALL acknowledge the newest page that is beeping.
6.15 WHEN the user presses the A, R or M key outside a text field, THE SYSTEM SHALL do what the ACK, READ or MUTE button does.
6.16 WHEN the user presses the ACK action on a lock-screen notification, THE SYSTEM SHALL acknowledge that page in the app.
6.17 IF a message is wider than the LCD, THEN THE SYSTEM SHALL hold it, scroll it to its end and repeat.
6.18 IF a message fits the LCD, THEN THE SYSTEM SHALL keep it still.
6.19 WHEN the app is opened without a test or demo switch (`?at`, `?fresh`, `?sample`, `?speed`), or with `?boot`, THE SYSTEM SHALL play a power-on sequence of about two seconds: a dark LCD, two backlight flickers, 88888, then 07734 hELLO with the LED lit.
6.20 WHERE the user prefers reduced motion, THE SYSTEM SHALL skip the power-on sequence.
6.21 WHERE the device supports vibration, WHEN a page beeps, THE SYSTEM SHALL vibrate in the rhythm of the chirp, with more pulses at each escalation level.
6.22 IF the add form is submitted with a missing or invalid field, THEN THE SYSTEM SHALL mark that field invalid, outline it and move focus to it.
6.23 WHERE the device has no hover-capable pointer, THE SYSTEM SHALL hide the keyboard hints.
6.24 WHEN every beeping page of the day has been answered or has gone moot and at least one budgeted page was missed, THE SYSTEM SHALL show one silent 666 recap listing the missed pages, without a beep and without counting toward the daily budget.
6.25 WHEN the user presses ACK while the 666 recap is showing and no page is beeping, THE SYSTEM SHALL dismiss the recap for that day.
6.26 WHEN the day sheet shows a missed beeping page, THE SYSTEM SHALL stamp it with "RIP" and the time it fired.
6.27 WHILE the clock is on a day that has pages, THE SYSTEM SHALL show a 6 AM-to-midnight day bar under the time machine clock with one tick per page and a playhead at the current time.
6.28 WHILE the clock is on the day the sheet shows, THE SYSTEM SHALL draw a "now" line between the pages already fired and the first page still ahead.
6.29 WHILE a leave-now (911) page is beeping and the pager is not reading memory, THE SYSTEM SHALL light the edges of the screen in ember, pulsing, or as a still border WHERE the user prefers reduced motion.

## Requirement 7: Time machine
**User story:** As a presenter or tester, I want to drive the clock, so that a whole day can be shown in a minute.

7.1 WHEN the user presses Pause, THE SYSTEM SHALL stop the clock.
7.2 WHILE the clock runs faster than real time and the pause option is on, WHEN a page fires, THE SYSTEM SHALL pause at the exact page time.
7.3 WHEN the user travels back in time, THE SYSTEM SHALL forget the beeps and ACKs that had not happened yet at the new time.
7.4 WHEN the URL has `?at=`, THE SYSTEM SHALL start the clock, paused, at that wall time in the pager's time zone.
7.5 WHEN the user presses the demo control, THE SYSTEM SHALL run the day from 6 AM at 900x.
7.6 WHILE a day run is paused on a page, WHEN the user presses ACK, THE SYSTEM SHALL resume the run at 900x.
7.7 WHEN the user presses +5 min, +15 min or +1 hr, THE SYSTEM SHALL jump the clock ahead by that amount.
7.8 WHEN the user presses Next page, THE SYSTEM SHALL jump the clock to the next beep.
7.9 WHEN the user picks 1x, 60x or 900x, THE SYSTEM SHALL run the clock at that speed.
7.10 WHEN the URL has `?speed=`, THE SYSTEM SHALL run the clock at that speed.
7.11 WHEN the URL has `?tz=` and no saved state exists, THE SYSTEM SHALL use that time zone for a fresh pager.
7.12 WHEN the URL has `?sample`, THE SYSTEM SHALL load the sample day.
7.13 WHEN the URL has `?fresh`, THE SYSTEM SHALL ignore saved state.
7.14 WHEN the user presses the demo control on an empty pager, THE SYSTEM SHALL load the sample day first.

## Requirement 8: Adapters and the real path
**User story:** As an operator, I want real routing and SMS behind the same interfaces, so that the free local demo and the production path share all logic.

8.1 WHERE the relay travel adapter is not selected, THE SYSTEM SHALL estimate travel with the free local straight-line estimate.
8.2 WHERE `VITE_TRAVEL=relay` and a relay URL is set, THE SYSTEM SHALL get travel times from Amazon Location Service through the relay, with the departure time.
8.3 WHERE `VITE_CHANNEL=relay` and a relay URL is set, WHEN a page beeps, THE SYSTEM SHALL send the page as an SMS through Amazon End User Messaging via the relay.
8.4 WHEN the relay receives a schedule request, THE SYSTEM SHALL create one self-deleting EventBridge Scheduler schedule per beep, replacing any schedule of the same name, so that pages go out with the browser closed.
8.5 IF the relay has no shared secret configured, THEN THE SYSTEM SHALL refuse every request.
8.6 WHILE the app runs in the browser, THE SYSTEM SHALL NOT hold or receive AWS credentials.
8.7 WHERE the relay channel is selected and the clock is live, WHEN the plan or acknowledgements change, THE SYSTEM SHALL schedule only the future beeps of changed pages.
8.8 IF a request to the relay lacks the shared secret, THEN THE SYSTEM SHALL refuse the request.
8.9 WHERE the relay channel is not selected, THE SYSTEM SHALL deliver out-of-app pages as browser notifications.
8.10 WHERE the relay channel is selected, WHEN the user presses ACK, THE SYSTEM SHALL withdraw that page's pending repeats.
8.11 WHERE the relay channel is selected and the clock is live, WHEN a page moves or leaves the plan, THE SYSTEM SHALL withdraw that page's scheduled beeps.
8.12 WHERE the relay channel is selected, WHEN a beep is already scheduled at the relay, THE SYSTEM SHALL NOT send it again from the open app.
8.13 WHEN the relay sends an SMS, THE SYSTEM SHALL send it only to the phone number in the relay's own configuration and SHALL ignore any destination in the request.
8.14 IF the relay has no valid pager number configured, THEN THE SYSTEM SHALL refuse `/page` and `/schedule` requests and send nothing when a schedule fires.
8.15 WHEN the relay checks the shared secret, THE SYSTEM SHALL compare it in constant time.
8.16 IF sending a page would exceed the configured daily cap of distinct pages, or of texts per page, THEN THE SYSTEM SHALL NOT send it and SHALL answer 429.
8.17 IF a request carries an `Origin` other than the configured PWA origin, THEN THE SYSTEM SHALL refuse it, and THE SYSTEM SHALL NOT send a wildcard CORS header.
8.18 IF a schedule request holds more than 64 beeps, or a beep that is not due within the next 48 hours, THEN THE SYSTEM SHALL refuse the request.

## Requirement 9: Learn from late ACKs
**User story:** As a user who is often not ready when the leave-now page comes, I want the pager to notice and suggest more prep time, so that the page matches how long I really take, without the pager changing my plans behind my back.

9.1 WHEN at least 2 of the last 3 answered leave-now pages of a routine were late ACKs, THE SYSTEM SHALL suggest a longer prep time for that routine.
9.2 WHEN the system suggests a prep time, THE SYSTEM SHALL offer a whole number of minutes, rounded up to 5, that is larger than the current prep time by about the average lateness of the late ACKs and by at least 5 minutes.
9.3 WHEN a leave-now page reaches its cutoff without an ACK, THE SYSTEM SHALL count it as a late answer.
9.4 WHILE a leave-now page is unacknowledged and before its cutoff, THE SYSTEM SHALL NOT count it as answered.
9.5 WHEN several commitments of one routine qualify, THE SYSTEM SHALL offer at most one suggestion for that routine.
9.6 IF the routine's current prep time is zero, THEN THE SYSTEM SHALL NOT suggest a prep time, so that a suggestion never adds a page.
9.7 WHILE a suggestion has not been applied, THE SYSTEM SHALL leave every commitment's prep time unchanged.
9.8 WHEN the user presses Apply, THE SYSTEM SHALL set the suggested prep time on the suggested commitment and on the routine's commitments that have not started, through the same state as other edits.
9.9 WHEN the user presses Dismiss, THE SYSTEM SHALL hide the suggestion for that routine.
9.10 WHEN the user applies a suggestion, THE SYSTEM SHALL ignore the leave-now pages that fired before it when learning about that routine.
9.11 WHEN a suggestion is shown, THE SYSTEM SHALL show the text "You often ACK this one late. Try N min prep instead of M." next to the commitment's title, with an Apply button and a Dismiss button that work from the keyboard.
9.12 WHEN the same pages, ACK times, settings and clock are given twice, THE SYSTEM SHALL return the same suggestions.
9.13 WHEN a suggestion is applied, THE SYSTEM SHALL NOT change the number of beeping pages.
9.14 WHEN an ACK is recorded at the instant a repeat is due, THE SYSTEM SHALL count the page as acknowledged at that repeat's level.
9.15 WHEN the app is reloaded, THE SYSTEM SHALL keep dismissed routines hidden and applied suggestions from reappearing.

## Requirement 10: Geocoding for typed addresses
**User story:** As a user, I want an address I type to give a real travel time, so that the leave-now page is not based on a guess.

10.1 WHEN an appointment is added with a typed address that matches no saved place, THE SYSTEM SHALL create a place for that address.
10.2 WHEN the system creates a place for a typed address, THE SYSTEM SHALL ask the geocoder for the address's coordinates once.
10.3 WHEN the geocoder returns a result, THE SYSTEM SHALL store its coordinates on that place, so that travel uses them.
10.4 IF the geocoder returns no result or fails, THEN THE SYSTEM SHALL keep the place without coordinates and use the default travel time.
10.5 WHEN a typed address matches a saved place, THE SYSTEM SHALL use that place without calling the geocoder.
10.6 WHERE the relay geocoder is not selected, THE SYSTEM SHALL geocode only against saved places that have coordinates and SHALL NOT invent coordinates.
10.7 WHERE `VITE_TRAVEL=relay` and a relay URL is set, THE SYSTEM SHALL geocode by POSTing the address and the shared secret to the relay's `/geocode` endpoint.
10.8 IF the network fails or the relay answers anything other than a position, THEN THE SYSTEM SHALL treat the address as not found.
10.9 WHEN a place gains coordinates after a route was estimated without them, THE SYSTEM SHALL estimate the route again.
10.10 WHEN the relay receives a valid `/geocode` request, THE SYSTEM SHALL return the position and label of the first Amazon Location Service Places result.
10.11 IF Amazon Location Service Places returns no usable result, THEN THE SYSTEM SHALL answer 404.
10.12 IF the address is empty or longer than 200 characters, THEN THE SYSTEM SHALL answer 400.
10.13 IF a `/geocode` request lacks the shared secret or carries a wrong one, THEN THE SYSTEM SHALL answer 401.
10.14 IF no Places client is configured, THEN THE SYSTEM SHALL answer 501 "geocoding not configured".
