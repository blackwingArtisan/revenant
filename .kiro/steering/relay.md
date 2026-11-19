---
inclusion: fileMatch
fileMatchPattern: "src/relay/**"
---
# Relay rules

Included only while a file under `src/relay/` is in context. The relay is the one server-side piece: an AWS Lambda behind a Function URL that does the jobs the browser must not do with AWS credentials. Full contract: `docs/real-path.md`. Threat model: "Threat model" in the spec's `design.md`.

## Where AWS code may live
- AWS SDK imports belong in `src/relay/` only. Nothing under `src/app/`, `src/adapters/` or `src/engine/` imports `@aws-sdk/*`; the browser talks to the relay over HTTPS with the `x-relay-secret` header.
- `@aws-sdk/*` packages stay in `optionalDependencies`, so a plain `npm ci` for the PWA never needs them.
- `handler.ts` takes every AWS client injected (`routes`, `places`, `sms`, `scheduler`) and holds all the logic. `lambda.ts` only reads the environment and builds the real clients. Keep it that way, so `tests/unit/relay.test.ts` covers everything with stub clients and never calls AWS.

## Limits that must hold after any change
- **No client-chosen destination.** Only `RELAY_PAGER_NUMBER` is ever texted. Ignore any `to` a request sends, and never put a phone number in a schedule payload.
- **Daily caps.** At most `RELAY_DAILY_PAGE_CAP` distinct pages a day (default 6, the silence budget) and `RELAY_SENDS_PER_PAGE` texts per page (default 4), reset at midnight in `RELAY_TIME_ZONE`.
- **Constant-time secret.** Compare `x-relay-secret` with `timingSafeEqual` on SHA-256 digests, never with `===`.
- **Origin check, no wildcard CORS.** Refuse any `Origin` other than `RELAY_ALLOWED_ORIGIN` with 403; send no `access-control-allow-origin` unless it is set.
- **Bounded scheduling.** `/schedule` takes at most 64 alerts per request, each within 48 hours, numeric codes only, SMS text at most 160 characters.
- A new route gets the same checks, in the same order: origin, secret, method, body validation, then the AWS call.

## IAM
The function's role gets exactly the actions its routes use, and nothing wider: `geo-routes:CalculateRoutes`, `geo-places:Geocode` (once geocoding is enabled), `sms-voice:SendTextMessage`, `scheduler:CreateSchedule`, `scheduler:ListSchedules`, `scheduler:DeleteSchedule`, and `iam:PassRole` on the scheduler role only. A new AWS call means a new line here, in `docs/real-path.md` and in the deployment notes, in the same change.

## Before calling a new AWS API
Check the request and response shape against current documentation through the AWS Documentation MCP server in `.kiro/settings/mcp.json`, then add a stub-client test for the success path, a bad-input 400 and the cap or permission failure.
