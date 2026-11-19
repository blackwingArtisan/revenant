# Requirements: On-call escalation to a secondary

## Introduction
"PagerDuty, for people who are the incident." A leave-now (911) page that the user never answers is the costliest miss Revenant can have: the page repeats, the repeats go unanswered, and the appointment starts without them. This spec adds an opt-in second line of defence. The user names a secondary on call (a partner, a roommate, a coach). If a must-priority leave-now page is still unacknowledged after its last repeat, Revenant pages the secondary on a second on-screen pager labelled "SECONDARY ON CALL", with a plain message saying who missed what and when it starts.

This pass is on-screen only. Nothing is sent to a real person: no SMS, no network call. Delivering the escalation through the relay (SMS to the secondary's own number, with their consent) is recorded as an out-of-scope follow-up in the design.

The feature builds on the `time-blind-paging` spec and keeps its rules: fewer pages beat more pages, no page fires at an event's start, the engine is deterministic and pure, everything stays on the device, and the pager is accessible. It is off by default. While it is off, the plan is exactly the plan `time-blind-paging` produces.

## Glossary
- **User**: the person carrying the pager, the one the pages are for.
- **Primary pager**: the existing pager that pages the user.
- **Secondary**: the person the user names to be paged when the user misses a leave-now page. In this pass the secondary is only a name; there is no account, number or address.
- **Secondary pager**: a second on-screen pager, labelled "SECONDARY ON CALL", that shows escalation pages and has its own ACK.
- **On-call setting**: the opt-in switch and the secondary's name, stored in settings.
- **Eligible page**: a leave-now page of a commitment with priority `must`. Only eligible pages escalate.
- **Last beep**: the final repeat of a leave-now page, or its first beep when it has no repeats.
- **Escalation instant**: the moment the secondary is paged: one minute after the last beep of the eligible page.
- **Escalation page**: the planned page shown on the secondary pager. Its kind is `escalation`, its code is 999 and its id is `<commitment id>:escalate`.
- **Reserved slot**: the one place in a day's silence budget that the planner sets aside for an escalation page before it ranks the day's other pages.
- **Cancelled**: the status of an escalation page whose eligible page was acknowledged at or before the escalation instant. A cancelled page never beeps.
- **Replay**: the "See what happens if you ignore it" demonstration on the day sheet.
- **Budget**, **ACK**, **Cutoff**, **Digest**, **Page** and **Alert** keep the meanings they have in `time-blind-paging`.

All acceptance criteria use the EARS forms: `WHEN <event>, THE SYSTEM SHALL ...`, `WHILE <state>, THE SYSTEM SHALL ...`, `IF <condition> THEN THE SYSTEM SHALL ...` and `WHERE <feature is present>, THE SYSTEM SHALL ...`, each stating one testable behavior. Criteria are numbered `N.M` under their requirement so `tests/unit/traceability.test.ts` can match them to tasks.

## Requirement 1: Opting in, opting out and the secondary's name
**User story:** As a user, I want to choose whether someone is paged when I miss a leave-now page, and who it is, so that escalation only happens with my say-so.

1.1 WHEN the app loads settings that have no on-call setting, THE SYSTEM SHALL treat on-call escalation as off.
1.2 WHEN the user turns escalation on with a valid name, THE SYSTEM SHALL save the on-call setting as enabled together with that name.
1.3 WHEN the user enters a name, THE SYSTEM SHALL trim leading and trailing whitespace and collapse each run of inner whitespace to one space.
1.4 IF the trimmed name is empty THEN THE SYSTEM SHALL keep escalation off and show a message beside the name field.
1.5 IF the trimmed name is longer than 24 characters THEN THE SYSTEM SHALL keep escalation off and show a message beside the name field.
1.6 IF the name contains a control character THEN THE SYSTEM SHALL keep escalation off and show a message beside the name field.
1.7 WHEN the user turns escalation off, THE SYSTEM SHALL plan no escalation pages and keep the saved name so that turning escalation on again restores it.
1.8 WHILE the on-call setting is saved or used, THE SYSTEM SHALL keep the name in local storage only and make no network request because of it.
1.9 IF a stored on-call setting is malformed THEN THE SYSTEM SHALL treat escalation as off and keep the rest of the stored snapshot.

## Requirement 2: Which pages escalate
**User story:** As a user, I want only the page I cannot afford to miss to reach my secondary, so that the secondary is not paged for small things.

2.1 WHERE escalation is on, THE SYSTEM SHALL plan an escalation page for a leave-now page of a commitment with priority must.
2.2 WHERE escalation is on, THE SYSTEM SHALL NOT plan an escalation page for a get-ready, focus-start, check-in, wrap-up or digest page.
2.3 WHERE escalation is on, THE SYSTEM SHALL NOT plan an escalation page for a leave-now page of a commitment with priority normal or low.
2.4 WHERE escalation is on and a local day has more than one eligible page, THE SYSTEM SHALL plan an escalation page only for the eligible page that fires first.
2.5 IF the escalation instant of an eligible page is not before its cutoff THEN THE SYSTEM SHALL plan no escalation page for it.
2.6 WHILE escalation is off, THE SYSTEM SHALL produce the same pages, digest and budget as a plan made without the on-call feature.

## Requirement 3: The escalation instant
**User story:** As a user, I want the secondary paged only after I have had every chance to answer, and in time to matter.

3.1 WHEN an eligible page is planned, THE SYSTEM SHALL set the escalation instant to one minute after its last beep.
3.2 WHEN the escalation offsets in settings change, THE SYSTEM SHALL recompute the escalation instant from the new last beep.
3.3 WHEN the escalation instant arrives and the eligible page is unacknowledged, THE SYSTEM SHALL beep the escalation page once.
3.4 WHEN an escalation page has beeped, THE SYSTEM SHALL NOT repeat it.
3.5 WHEN an escalation page is planned, THE SYSTEM SHALL set its cutoff to the cutoff of its eligible page, which is the start of the commitment.
3.6 WHEN a daylight-saving change falls between the eligible page and the escalation instant, THE SYSTEM SHALL keep the escalation instant exactly one elapsed minute after the last beep.

## Requirement 4: The message, the code and the label
**User story:** As a secondary, I want a plain message that tells me who missed what and when it starts, so that I can act without asking questions.

4.1 WHEN an escalation page is planned, THE SYSTEM SHALL give it the code 999.
4.2 WHEN an escalation page is planned, THE SYSTEM SHALL word it as `<NAME>: OWNER MISSED 911, <VERB> FOR <TITLE>. STARTS <TIME>`, with the name and title in upper case, the verb LEAVE or JOIN as on the eligible page, and the start time in the settings time zone in the LCD clock format.
4.3 IF the commitment title would make the message longer than 120 characters THEN THE SYSTEM SHALL shorten the title with an ellipsis and keep the verb and the start time.
4.4 WHEN an escalation page is shown, THE SYSTEM SHALL label the secondary pager "SECONDARY ON CALL".
4.5 WHEN an escalation page beeps, THE SYSTEM SHALL announce the label, the code and the message to screen readers through a live region.
4.6 WHERE the wallet code card is shown, THE SYSTEM SHALL list code 999 with its meaning and detail.
4.7 WHILE escalation is off and no escalation page is showing, THE SYSTEM SHALL NOT show the secondary pager.

## Requirement 5: The daily silence budget
**User story:** As a user, I want escalation to count against my daily beep budget, so that adding a safety net never turns into more noise.

5.1 WHERE escalation is on, THE SYSTEM SHALL count each planned escalation page as one beeping page of its local day.
5.2 WHEN the planner has an eligible page for a day, THE SYSTEM SHALL reserve one slot of the day's budget for its escalation page before ranking the day's other beeping pages against the remaining slots.
5.3 WHEN a local day is planned, THE SYSTEM SHALL NOT plan more beeping pages, escalation pages included, than settings.dailyBudget.
5.4 IF settings.dailyBudget is less than 2 THEN THE SYSTEM SHALL plan no escalation page.
5.5 IF the eligible page does not fit in the remaining slots after the reservation THEN THE SYSTEM SHALL release the reserved slot and plan no escalation page for that day.
5.6 WHEN the reserved slot pushes a beeping page out of the day's budget, THE SYSTEM SHALL list that page in the day's digest with the reason over-budget.
5.7 WHEN an escalation page has beeped and the plan changes, THE SYSTEM SHALL keep its slot.
5.8 WHEN a day's budget is shown, THE SYSTEM SHALL include the reserved slot in the used count.

## Requirement 6: ACK on either pager
**User story:** As a user, I want answering my own page to stop the escalation, and I want the secondary to be able to answer theirs.

6.1 WHEN the user acknowledges an eligible page at or before its escalation instant, THE SYSTEM SHALL cancel its escalation page so that it never beeps.
6.2 WHEN an escalation page is cancelled, THE SYSTEM SHALL report its status as cancelled and not as missed.
6.3 WHEN the user acknowledges an eligible page after its escalation instant, THE SYSTEM SHALL leave the escalation page as it is.
6.4 WHEN the secondary presses ACK on the secondary pager, THE SYSTEM SHALL record the acknowledgement time under the escalation page's own id.
6.5 WHEN the secondary acknowledges an escalation page, THE SYSTEM SHALL NOT change the status or the acknowledgement of the eligible page.
6.6 WHEN the user acknowledges an eligible page after its escalation page has beeped, THE SYSTEM SHALL NOT acknowledge the escalation page.
6.7 WHEN a page cutoff passes without an ACK on the escalation page, THE SYSTEM SHALL mark it missed on the secondary pager and the day sheet.
6.8 IF an escalation page came due and went moot while the app was closed THEN THE SYSTEM SHALL NOT beep for it.
6.9 WHEN an escalation alert has been delivered, THE SYSTEM SHALL NOT deliver it again.

## Requirement 7: The day sheet and the receipt
**User story:** As a user, I want the day sheet and the end-of-day receipt to show what escalated, so that I can see what the safety net did.

7.1 WHERE a day has an escalation page, THE SYSTEM SHALL list it on the day sheet with its code, its time, the secondary's name and its status.
7.2 WHEN an escalation page is cancelled, THE SYSTEM SHALL show it on the day sheet with the text "cancelled, you answered".
7.3 WHEN the end-of-day receipt is built, THE SYSTEM SHALL count an escalation page in the day's beeps only if it was not cancelled.
7.4 WHEN the end-of-day receipt is built, THE SYSTEM SHALL NOT count an unanswered escalation page in the day's missed pages.
7.5 WHEN an escalation page beeped on the day, THE SYSTEM SHALL add the number escalated and the secondary's name to the receipt line.
7.6 WHEN a day's missed pages are collected for the 666 recap or the next morning's rebook page, THE SYSTEM SHALL leave escalation pages out.

## Requirement 8: The "See what happens if you ignore it" replay
**User story:** As a person deciding whether to turn this on, I want the replay to show the secondary being paged, so that I see the whole chain.

8.1 WHEN the replay chooses the page to let slip, THE SYSTEM SHALL NOT choose an escalation page.
8.2 WHERE escalation is on and the page the replay lets slip has an escalation page, THE SYSTEM SHALL play the repeats of that page, then the escalation page on the secondary pager, then the 666 recap, in that order.
8.3 WHEN the replay answers the other pages of the day, THE SYSTEM SHALL cancel their escalation pages and SHALL NOT acknowledge the escalation page of the page that slips.
8.4 WHEN the replay jumps to the end of the day, THE SYSTEM SHALL count every beep up to that point as delivered so that nothing sounds on the way.
8.5 WHERE escalation is off or the page that slips has no escalation page, THE SYSTEM SHALL play the replay exactly as it plays without the on-call feature.

## Requirement 9: Persistence across reload
**User story:** As a user, I want my choice and the state of any escalation to survive a reload.

9.1 WHEN the app reloads, THE SYSTEM SHALL restore the on-call setting and the name from local storage.
9.2 WHEN the app reloads after an escalation page beeped or was acknowledged, THE SYSTEM SHALL keep its delivered and acknowledged state so that it does not beep again.
9.3 WHEN the app loads a snapshot saved before this feature existed, THE SYSTEM SHALL load it with escalation off.

## Requirement 10: Keyboard access and accessibility
**User story:** As a keyboard or screen reader user, I want to set up and answer the secondary pager without a mouse.

10.1 WHERE the settings form or the secondary pager is shown, THE SYSTEM SHALL make the on-call switch, the name field and the secondary ACK button reachable and operable by keyboard, each with an accessible name and a visible focus indicator.
10.2 WHEN the user presses the S key outside a text field while an escalation page is showing, THE SYSTEM SHALL acknowledge the escalation page.
10.3 IF the name is refused THEN THE SYSTEM SHALL mark the field invalid and tie the message to it with aria-describedby.
10.4 WHILE escalation is on and the secondary pager is paging, THE SYSTEM SHALL pass an axe-core scan for WCAG 2.1 A and AA with zero violations.
10.5 WHEN the secondary pager is announced, THE SYSTEM SHALL announce it without moving keyboard focus.

## Requirement 11: Reduced motion and sound
**User story:** As a user who is sensitive to motion or sound, I want the secondary pager to respect my settings.

11.1 WHERE the user prefers reduced motion, THE SYSTEM SHALL show the secondary pager still, with the same label, code and message as the animated one.
11.2 WHILE the pager is muted, THE SYSTEM SHALL NOT chirp or vibrate for an escalation page and SHALL still show and announce it.

## Requirement 12: Determinism, purity and no network
**User story:** As a maintainer, I want the same inputs to give the same escalation, and no hidden I/O, so that the engine stays testable and the feature stays private.

12.1 WHEN the same commitments, settings and clock are planned twice, THE SYSTEM SHALL produce the same escalation pages in the same order.
12.2 WHEN the same commitments arrive in a different order, THE SYSTEM SHALL produce the same escalation pages.
12.3 WHEN escalation pages are computed, THE SYSTEM SHALL do so without reading the system clock, generating random values or performing I/O.
12.4 WHERE the relay channel is selected, THE SYSTEM SHALL NOT send an escalation page or its alerts to the relay.
12.5 WHEN an escalation page beeps, THE SYSTEM SHALL NOT make a network request or show a browser notification.
