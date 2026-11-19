# The real path: routes, SMS and pages with the browser closed

Revenant runs entirely in the browser by default. The real path adds one AWS Lambda function, the **relay** (`src/relay`), so that travel times come from real road routing and pages reach a phone as SMS even when the app is closed. The browser never holds AWS credentials; the relay runs with an IAM role.

```
PWA --(x-relay-secret)--> Lambda Function URL (src/relay/lambda.ts)
                           |-- POST /route-eta  -> Amazon Location Service  GeoRoutes CalculateRoutes
                           |-- POST /page       -> AWS End User Messaging   SendTextMessage (TRANSACTIONAL)
                           |-- POST /schedule   -> EventBridge Scheduler     CreateSchedule at(...), self-deleting
                           |-- POST /ack        -> EventBridge Scheduler     ListSchedules + DeleteSchedule
                           '-- scheduled event  -> SendTextMessage (the schedule's payload)
```

Nothing in this repository deploys the relay. All its logic is in `src/relay/handler.ts` and is unit-tested against stub AWS clients (`tests/unit/relay.test.ts`).

## Endpoints
| Endpoint | Body | Does |
|---|---|---|
| `POST /route-eta` | `{ origin: [lon, lat], destination: [lon, lat], mode, departAt? }` | Fastest route; returns `{ minutes }` (rounded up) |
| `POST /page` | `{ to, code, text }` | One SMS, at most 160 characters: `911 LEAVE NOW: ...` |
| `POST /schedule` | `{ to, alerts: [{ id, at (epoch ms), code, text }] }` | One one-time schedule per alert, deleted after it runs |
| `POST /ack` | `{ pageId }` | Deletes the page's pending repeat schedules |

Errors: `401` missing or wrong secret, `503` relay not configured, `400` bad input, `404` unknown path, `502` with the AWS error name.

## Setting it up (owner steps, not automated)
1. **Phone number.** In AWS End User Messaging SMS, register an origination identity (a toll-free number needs registration before it can send). Put its ARN or number in `RELAY_ORIGINATION_IDENTITY`.
2. **Scheduler.** Create a schedule group (default `revenant-pager`) and an IAM role that EventBridge Scheduler can assume to invoke the relay Lambda. Set `RELAY_SCHEDULER_TARGET_ARN` (the Lambda ARN) and `RELAY_SCHEDULER_ROLE_ARN`.
3. **Lambda.** Bundle `src/relay/lambda.ts` (for example with esbuild) and deploy it with a Function URL (auth type NONE; the relay checks its own shared secret). Its role needs `geo-routes:CalculateRoutes`, `sms-voice:SendTextMessage`, `scheduler:CreateSchedule`, `scheduler:ListSchedules`, `scheduler:DeleteSchedule` and `iam:PassRole` on the scheduler role.
4. **Secret.** Set `RELAY_SHARED_SECRET` to a long random value and `RELAY_ALLOWED_ORIGIN` to the PWA's origin.
5. **App.** Build the PWA with `VITE_TRAVEL=relay`, `VITE_CHANNEL=relay`, `VITE_RELAY_URL`, `VITE_RELAY_SECRET` and `VITE_PAGER_NUMBER`.

The shared secret is suitable for a single-user deployment. A multi-user version would replace it with Amazon Cognito sign-in.

## Cost shape
Each beeping page is one SMS (US pricing is a fraction of a cent plus carrier fees) and one short-lived schedule. Routing is one CalculateRoutes request per new route per hour (the app caches by route, mode and departure hour). With a budget of six pages a day, a user costs well under a dollar a month.
