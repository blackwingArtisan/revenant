---
inclusion: always
---
# Tech stack and engineering rules

## Stack
- TypeScript everywhere, `strict` on, `noUncheckedIndexedAccess` on. Node 22+.
- Client: React 19 PWA built with Vite. Plain CSS with design tokens (custom properties). No UI framework.
- Service worker (`public/sw.js`): offline app shell and the ACK action on lock-screen notifications.
- Tests: Vitest for unit tests, Playwright for end-to-end tests against the production build (`vite build && vite preview`).
- Deploy target (free): static hosting (Cloudflare Pages or any static host) for the PWA. The optional relay is one AWS Lambda function behind a Function URL. Nothing is deployed from this repository.

## Engine rules
- `src/engine` is pure: no I/O, no `Date.now()`, no randomness. Time comes in as epoch milliseconds. Enforced by `tests/unit/purity.test.ts` (`npm run check:engine`), which the engine-purity hook runs on every engine save.
- All instants are epoch ms. Wall-clock values exist only at the edges (day boundaries, digest time, calendar import) and are converted with `Intl` in the user's IANA time zone (`src/engine/time.ts`). Lead times are subtracted in real minutes, so daylight-saving changes never shift a page.
- Page ids are stable (`<commitment>:<kind>`), so a re-plan keeps acknowledgements and the budget slot of a page that already beeped.

## Adapters
Each external service is a port with a free local implementation (default, used by every test) and a real implementation that is written and type-checked but only selected by env var.

| Port | Local (default) | Real | Env var |
|---|---|---|---|
| Clock | `SimClock` (pause, jump, speed) | same clock at 1x | URL `?at=`, `?speed=` |
| Travel time | straight-line distance x 1.3 at a per-mode speed | Amazon Location Service `CalculateRoutes` via the relay | `VITE_TRAVEL=local\|relay` |
| Address lookup | saved places only; never invents coordinates | Amazon Location Service Places (GeoPlaces `Geocode`) via the relay's `/geocode`; answers 501 until `@aws-sdk/client-geo-places` is added to the relay | `VITE_TRAVEL=local\|relay` |
| Out-of-app pages | Web Notifications from the service worker, with an ACK action | SMS via Amazon End User Messaging, repeats scheduled with EventBridge Scheduler | `VITE_CHANNEL=browser\|relay` |
| Store | `localStorage` (guarded) | same port, swap for a synced store later | none |

The browser never holds AWS credentials: real adapters call the relay (`src/relay`), which holds an IAM role.

## Code rules
- Small modules, named exports; React components are the only default export (`App`).
- No secrets in the repo. Sample data is invented.
- Every commit passes `npm run check` (typecheck + unit) and `npm run test:e2e` from a clean checkout.

## Ports
Dev server 3150, preview 3151, Playwright 3152.
