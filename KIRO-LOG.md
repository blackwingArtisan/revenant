# Kiro log

How Revenant uses Kiro: what is in [`/.kiro`](.kiro), what Kiro built, and where the proof is.

## Kiro features at a glance
| Kiro feature | Where | How it is used | Proof |
|---|---|---|---|
| **Spec-driven development** | [`.kiro/specs/time-blind-paging/`](.kiro/specs/time-blind-paging) | 10 requirements with 151 numbered EARS acceptance criteria, a design with algorithms, a threat model and five correctness properties checked with fast-check, and 46 tasks (38 done, 8 open), each mapped to the criteria it satisfies. A traceability test fails if any criterion is left without a task. | [`requirements.md`](.kiro/specs/time-blind-paging/requirements.md), [`tasks.md`](.kiro/specs/time-blind-paging/tasks.md) |
| **Spec task execution** | Tasks 25 and 26 | Kiro took two open tasks from the spec to done: it wrote the criteria and design sections first, then the code and tests, then checked the tasks off. | [`src/engine/learn.ts`](src/engine/learn.ts), [`src/adapters/geocode.ts`](src/adapters/geocode.ts), [session A](docs/kiro-sessions/2026-11-19-session-a.md) |
| **Spec review** | `requirements.md`, `tasks.md` | Kiro rewrote every acceptance criterion into strict EARS form, audited each task against the code and tests, unchecked one that had no test, and added seven gap tasks. | [Session A, "Spec changes"](docs/kiro-sessions/2026-11-19-session-a.md#spec-changes) |
| **Steering** | [`.kiro/steering/`](.kiro/steering) | Always included: `product.md` (the paging rules and the evidence), `tech.md` (the pure-engine rule and the adapters), `structure.md` (where code goes and the checklist for a new page kind). Conditional: `relay.md` loads only when a file under `src/relay/` is in context (`fileMatch`), with the no-SDK-in-the-browser rule, the caps and the IAM actions. Manual: `demo-script.md`, pulled in with `#demo-script`. | The five files |
| **Hooks** | [`.kiro/hooks/`](.kiro/hooks) | Eight hooks: a PreToolUse write guard that refuses engine writes adding `Date.now`, `Math.random` or an outside import; unit tests on save; an agent hook that restates the paging rules when the planner changes; an engine-purity check on save; a post-task check that the spec still traces; a typecheck, unit and traceability run on stop; an agent hook that keeps the wallet code card in sync; and a manual "demo ready" run. Kiro converted four of them to the current format. | The eight `.json` files, tested in [`tests/unit/hooks.test.ts`](tests/unit/hooks.test.ts); [session A, "Hook changes"](docs/kiro-sessions/2026-11-19-session-a.md#hook-changes) |
| **Custom agent** | [`.kiro/agents/revenant-engine.json`](.kiro/agents/revenant-engine.json) | An engine-only agent: steering and spec as resources, writes limited to `src/engine/`, `tests/unit/` and the spec, installs and pushes denied, with the write guard on `preToolUse` and `npm run check` on `stop`. | The agent file |
| **MCP** | [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json) | The AWS Documentation server and Context7, for checking AWS request shapes and library APIs against current documentation. | The settings file |
| **Autonomous agent run** | `kiro-cli chat --v3 --no-interactive` | A 13-minute unattended session that read the steering, changed the spec, code, tests, hooks and docs, ran `npm run check` itself and caught its own bug. | [Session A](docs/kiro-sessions/2026-11-19-session-a.md) |

## What Kiro built
- **The late-ACK learner** ([`src/engine/learn.ts`](src/engine/learn.ts), 15 unit tests). If the leave-now page for a routine is answered late in 2 of the last 3 times, the day sheet suggests more prep time. It only suggests; nothing changes until the user presses Apply. One of Kiro's own new tests caught an ordering bug in the learner, and Kiro fixed it in the same session.
- **The geocoder port** ([`src/adapters/geocode.ts`](src/adapters/geocode.ts), 13 unit tests), a free saved-places geocoder, a relay geocoder, and the relay's `/geocode` route for Amazon Location Service Places, with 7 route tests.
- **The spec as it stands**: every criterion in EARS form, Requirements 9 and 10, the design sections for both features, and the gap tasks that keep the spec honest about what is untested.
- **The hooks in the current format**, with one anchored regex matcher each.
- Two Playwright tests for the new features. After the session, the developer ran the whole suite: 128 of 128 unit tests (93 before) and 19 of 19 end-to-end tests (16 before), with nothing to fix.

## Who did what
| Part | Produced by |
|---|---|
| EARS rewrite of every criterion, the task audit and seven gap tasks | Kiro (session A) |
| The late-ACK learner, the geocoder port, both geocoders, the relay's `/geocode` route and their tests | Kiro (session A) |
| Conversion of four hooks to the current format | Kiro (session A) |
| Steering, the first spec draft and the first build (engine, pager UI, time machine, .ics import, relay) | The developer, in Kiro's spec format, task by task from `tasks.md` |
| Everything after session A (tasks 34-45: relay hardening, the receipt, the before/after card, the boot sequence, the 666 haunting, the purity guard, the custom agent, the MCP settings, the phone fit, the 60-second demo, the write guard, the traceability test, the ignore-it replay with the next morning's rebook page, the thermal receipt with the silence line, and the correctness properties) | The developer, each recorded as a checked task with its criteria |
| Running the Playwright suite after the session | The developer |

## Sessions
- [Session A](docs/kiro-sessions/2026-11-19-session-a.md), 2026-11-19: spec review, tasks 25 and 26, hook conversion. 13 min 2 s, 22.34 of 4,000 bonus credits, exit code 0. The exact prompt, every changed file and what was left open are in the record.

Next: a recorded session for the open tasks (14.2 and 27-33), capturing the hooks firing and an MCP lookup.
