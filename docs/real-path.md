# The real path: routes, SMS and pages with the browser closed

Revenant runs entirely in the browser by default. The real path adds one AWS Lambda function, the **relay** (`src/relay`), so that travel times come from real road routing and pages reach a phone as SMS even when the app is closed. The browser never holds AWS credentials; the relay runs with an IAM role.

```
PWA --(x-relay-secret)--> Lambda Function URL (src/relay/lambda.ts)
                           |-- POST /route-eta  -> Amazon Location Service  GeoRoutes CalculateRoutes
                           |-- POST /geocode    -> Amazon Location Service  GeoPlaces Geocode (needs @aws-sdk/client-geo-places, see below)
                           |-- POST /page       -> AWS End User Messaging   SendTextMessage (TRANSACTIONAL)
                           |-- POST /schedule   -> EventBridge Scheduler     CreateSchedule at(...), self-deleting
                           |-- POST /ack        -> EventBridge Scheduler     ListSchedules + DeleteSchedule
                           '-- scheduled event  -> SendTextMessage (the schedule's payload)
```

In relay mode the app keeps the relay's schedules in step with the plan (`src/adapters/schedule-sync.ts`): when the plan or an ACK changes, it withdraws pages that moved or were removed and schedules the future beeps of changed pages. It does this only while the clock is live, never from the time machine. Beeps the relay has scheduled are not sent again by the open app.

Nothing in this repository deploys the relay. All its logic is in `src/relay/handler.ts` and is unit-tested against stub AWS clients (`tests/unit/relay.test.ts`).

## Endpoints
| Endpoint | Body | Does |
|---|---|---|
| `POST /route-eta` | `{ origin: [lon, lat], destination: [lon, lat], mode, departAt? }` | Fastest route; returns `{ minutes }` (rounded up) |
| `POST /geocode` | `{ address }` (1 to 200 characters) | First Places result as `{ lat, lon, label }` |
| `POST /page` | `{ pageId, code, text }` | One SMS to the configured `RELAY_PAGER_NUMBER`, at most 160 characters: `911 LEAVE NOW: ...` |
| `POST /schedule` | `{ alerts: [{ id, at (epoch ms), code, text }] }` (at most 64, each due within 48 hours) | One one-time schedule per alert, deleted after it runs; an existing schedule with the same name is replaced |
| `POST /ack` | `{ pageId }` | Deletes the page's pending repeat schedules |

Errors: `401` missing or wrong secret, `403` a browser origin other than `RELAY_ALLOWED_ORIGIN`, `503` relay or pager number not configured, `400` bad input, `404` unknown path (or, for `/geocode`, an address with no result), `429` daily page cap reached, `501` geocoding not configured, `502` with the AWS error name.

## Limits that keep the relay from being an open SMS gateway
- **No client-chosen destination.** The relay texts only `RELAY_PAGER_NUMBER`. A `to` field in a request is ignored, and schedule payloads carry no phone number.
- **Daily caps.** At most `RELAY_DAILY_PAGE_CAP` distinct pages a day (default 6, the beep budget) and `RELAY_SENDS_PER_PAGE` texts per page (default 4: the first beep and three repeats), reset at midnight in `RELAY_TIME_ZONE`. Over the cap, `/page` answers 429 and a firing schedule sends nothing.
- **Constant-time secret check.** `x-relay-secret` is compared with `crypto.timingSafeEqual` on SHA-256 digests.
- **Origin check, no wildcard CORS.** Requests carrying an `Origin` other than `RELAY_ALLOWED_ORIGIN` get 403, and the Function URL sends no `access-control-allow-origin` unless that variable is set.
- **Bounded scheduling.** `/schedule` accepts at most 64 beeps per request, each due within the next 48 hours, with numeric codes only.

The in-memory cap lives as long as a warm Lambda environment, so it bounds bursts; a durable ledger can replace it behind the `SendLedger` interface. Set an AWS End User Messaging monthly spend limit as the account-level backstop. The full threat model is in `.kiro/specs/time-blind-paging/design.md`.

## Geocoding (not enabled yet)
In relay mode the app geocodes an address typed on the add form once, when it matches no saved place, and stores the coordinates on the new place so travel uses them. The relay's `/geocode` route calls the GeoPlaces v2 `Geocode` operation through a narrow `PlacesClient` interface typed in `src/relay/handler.ts`.

The SDK package `@aws-sdk/client-geo-places` is **not installed** in this repository, so `src/relay/lambda.ts` leaves the places client unset and `/geocode` answers `501 {"error":"geocoding not configured"}`. The app treats that as "no match" and keeps the default travel time. To enable it (tracked as task 27 in `.kiro/specs/time-blind-paging/tasks.md`):
1. Add `@aws-sdk/client-geo-places` to the relay's dependencies.
2. In `lambda.ts`, build the client: `places: { send: (r) => placesClient.send(new GeocodeCommand(r.input)) }` with `new GeoPlacesClient({ region })`.
3. Grant the Lambda role `geo-places:Geocode`.

## Setting it up (owner steps, not automated)
1. **Phone number.** In AWS End User Messaging SMS, register an origination identity (a toll-free number needs registration before it can send). Put its ARN or number in `RELAY_ORIGINATION_IDENTITY`.
2. **Scheduler.** Create a schedule group (default `revenant-pager`) and an IAM role that EventBridge Scheduler can assume to invoke the relay Lambda. Set `RELAY_SCHEDULER_TARGET_ARN` (the Lambda ARN) and `RELAY_SCHEDULER_ROLE_ARN`.
3. **Lambda.** Bundle `src/relay/lambda.ts` (for example with esbuild) and deploy it with a Function URL (auth type NONE; the relay checks its own shared secret). Its role needs `geo-routes:CalculateRoutes`, `geo-places:Geocode` (once geocoding is enabled), `sms-voice:SendTextMessage`, `scheduler:CreateSchedule`, `scheduler:ListSchedules`, `scheduler:DeleteSchedule` and `iam:PassRole` on the scheduler role.
4. **Secret and limits.** Set `RELAY_SHARED_SECRET` to a long random value, `RELAY_ALLOWED_ORIGIN` to the PWA's origin, `RELAY_PAGER_NUMBER` to the phone that receives pages, and optionally `RELAY_DAILY_PAGE_CAP`, `RELAY_SENDS_PER_PAGE` and `RELAY_TIME_ZONE`.
5. **App.** Build the PWA with `VITE_TRAVEL=relay`, `VITE_CHANNEL=relay`, `VITE_RELAY_URL` and `VITE_RELAY_SECRET`. The browser never holds the phone number.

The shared secret is suitable for a single-user deployment, and it is visible to anyone who can load a relay-mode build, so keep such a build private. A multi-user version would replace it with Amazon Cognito sign-in.

## Cost shape
Prices from the AWS pricing pages for End User Messaging, EventBridge Scheduler and Lambda, checked on 2026-11-19. A budget of six pages a day is about 180 pages a month per user.

| Per user, per month | Arithmetic | Cost |
|---|---|---|
| SMS to the pager phone (built) | 180 US toll-free texts x ($0.00774 AWS fee + $0.00421 carrier fee) | about $2.15, plus repeats when a page is not ACK'd |
| Toll-free number (built) | $2 a month lease, shared by every user on the number | $2 / number of users |
| Web Push (planned default) | 180 Scheduler invocations ($1.00 per million after 14 million free) + about 360 Lambda requests ($0.20 per million after 1 million free) | well under 1 cent |
| Routing | one CalculateRoutes request per new route per hour (the app caches by route, mode and departure hour) | a few cents at most |

So a relay tier at $3-4 a month covers Web Push with a wide margin, and SMS to an old phone is better priced as an add-on.
