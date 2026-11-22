# Kiro log

How Revenant uses Kiro: what is in [`/.kiro`](.kiro), what Kiro built, and where the proof is.

**Kiro by the numbers.** 9 recorded `kiro-cli` sessions. Kiro wrote the whole on-call escalation feature: its spec (12 requirements, 71 EARS criteria, 21 tasks) and every code, test and doc line in its five commits, 2,421 added lines (and 39 more in session F's fix). The developer changed one word of that by hand. Unit tests went from 219 to 315 (plus 1 skipped by design), and end-to-end tests from 31 to 41. Kiro made 4 Context7 MCP calls. The PreToolUse write guard refused Kiro's own probe write, and in session F kiro-cli reported 8 hook runs. At most 110.08 of 4,000 bonus credits were used in all, at most 87.74 of them on this feature (see the note under the sessions table).

## Kiro features at a glance
| Kiro feature | Where | How it is used | Proof |
|---|---|---|---|
| **Spec-driven feature, end to end** | [`.kiro/specs/on-call-escalation/`](.kiro/specs/on-call-escalation) | Kiro wrote the requirements (12 requirements, 71 EARS criteria), the design (a reserved budget slot, 8 fast-check properties, open questions with defaults) and 21 tasks in two session groups. It then built all 21 tasks over six more sessions, ticking each one as its checks passed. | [Sessions B to E](#sessions), the five commits marked "by Kiro" |
| **Spec-driven development** | [`.kiro/specs/time-blind-paging/`](.kiro/specs/time-blind-paging) | 10 requirements with 151 numbered EARS acceptance criteria, a design with algorithms, a threat model and five correctness properties checked with fast-check, and 46 tasks (38 done, 8 open), each mapped to the criteria it satisfies. A traceability test fails if any criterion is left without a task. | [`requirements.md`](.kiro/specs/time-blind-paging/requirements.md), [`tasks.md`](.kiro/specs/time-blind-paging/tasks.md) |
| **Spec task execution** | Tasks 25 and 26 | Kiro took two open tasks from the spec to done: it wrote the criteria and design sections first, then the code and tests, then checked the tasks off. | [`src/engine/learn.ts`](src/engine/learn.ts), [`src/adapters/geocode.ts`](src/adapters/geocode.ts), [session A](docs/kiro-sessions/2026-11-19-session-a.md) |
| **Spec review** | `requirements.md`, `tasks.md` | Kiro rewrote every acceptance criterion into strict EARS form, audited each task against the code and tests, unchecked one that had no test, and added seven gap tasks. | [Session A, "Spec changes"](docs/kiro-sessions/2026-11-19-session-a.md#spec-changes) |
| **Steering** | [`.kiro/steering/`](.kiro/steering) | Always included: `product.md` (the paging rules and the evidence), `tech.md` (the pure-engine rule and the adapters), `structure.md` (where code goes and the checklist for a new page kind). Conditional: `relay.md` loads only when a file under `src/relay/` is in context (`fileMatch`), with the no-SDK-in-the-browser rule, the caps and the IAM actions. Manual: `demo-script.md`, pulled in with `#demo-script`. | The five files |
| **Hooks** | [`.kiro/hooks/`](.kiro/hooks) | Eight hooks: a PreToolUse write guard that refuses engine writes adding `Date.now`, `Math.random` or an outside import; unit tests on save; an agent hook that restates the paging rules when the planner changes; an engine-purity check on save; a post-task check that the spec still traces; a typecheck, unit and traceability run on stop; an agent hook that keeps the wallet code card in sync; and a manual "demo ready" run. Kiro converted four of them to the current format. In session C, Kiro's probe write of `Date.now()` into the engine went through, because kiro-cli 3.5 names its payload fields `text` and `newStr`. Kiro fixed the guard in session D, and in session D2 the same probe came back `Failed: Write File` with no file created. In session F, kiro-cli reported the guard, tests on save and the stop check running 8 times. | The eight `.json` files, tested in [`tests/unit/hooks.test.ts`](tests/unit/hooks.test.ts); [session A, "Hook changes"](docs/kiro-sessions/2026-11-19-session-a.md#hook-changes); [session D2](docs/kiro-sessions/2026-11-19-session-d2-guard-probe.md); [session F](docs/kiro-sessions/2026-11-22-session-f-learner-property.md) |
| **Custom agent** | [`.kiro/agents/revenant-engine.json`](.kiro/agents/revenant-engine.json) | An engine-only agent: steering and spec as resources, writes limited to `src/engine/`, `tests/unit/` and the spec, installs and pushes denied, with the write guard on `preToolUse` and `npm run check` on `stop`. Session C built the escalation engine with it. | The agent file, [session C](docs/kiro-sessions/2026-11-19-session-c-escalation-engine.md) |
| **MCP** | [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json) | The AWS Documentation server and Context7, pinned to exact versions (1.2.4 and 4.5.0) with only their read tools auto-approved. In session E, Kiro called Context7 four times (`resolve-library-id` and `query-docs` for `@axe-core/playwright` and Playwright) before writing the axe and reduced-motion tests. The AWS server has not been called yet. | The settings file, [session E](docs/kiro-sessions/2026-11-22-session-e-browser-tests.md) |
| **Autonomous agent run** | `kiro-cli chat --v3 --no-interactive` | A 13-minute unattended session that read the steering, changed the spec, code, tests, hooks and docs, ran `npm run check` itself and caught its own bug. | [Session A](docs/kiro-sessions/2026-11-19-session-a.md) |

## What Kiro built
- **On-call escalation to a secondary** ([`.kiro/specs/on-call-escalation/`](.kiro/specs/on-call-escalation), [`src/engine/escalate.ts`](src/engine/escalate.ts), [`SecondaryPager.tsx`](src/app/components/SecondaryPager.tsx), [`tests/e2e/on-call.spec.ts`](tests/e2e/on-call.spec.ts)). Name someone on call, and if a must-go `911` is still unanswered a minute after its last repeat, a second on-screen pager labelled SECONDARY ON CALL shows `999`. The escalation takes one reserved beep from the daily budget, so a day never beeps more than its limit. An ACK cancels it, and it is kept off the relay and off notifications. It is off by default and on-screen only. Kiro wrote the spec, the pure engine with 8 fast-check properties, the two-pager app, the settings form, the day sheet row, a relay guard, the docs and 10 browser tests including an axe scan. Its own phone screenshots caught a layout bug that no test had, and it fixed it.
- **The late-ACK learner** ([`src/engine/learn.ts`](src/engine/learn.ts), 15 unit tests). If the leave-now page for a routine is answered late in 2 of the last 3 times, the day sheet suggests more prep time. It only suggests; nothing changes until the user presses Apply. One of Kiro's own new tests caught an ordering bug in the learner, and Kiro fixed it in the same session.
- **The geocoder port** ([`src/adapters/geocode.ts`](src/adapters/geocode.ts), 13 unit tests), a free saved-places geocoder, a relay geocoder, and the relay's `/geocode` route for Amazon Location Service Places, with 7 route tests.
- **The spec as it stands**: every criterion in EARS form, Requirements 9 and 10, the design sections for both features, and the gap tasks that keep the spec honest about what is untested.
- **The hooks in the current format**, with one anchored regex matcher each.
- Two Playwright tests for the new features. After the session, the developer ran the whole suite: 128 of 128 unit tests (93 before) and 19 of 19 end-to-end tests (16 before), with nothing to fix.

## Who did what
| Part | Produced by |
|---|---|
| The on-call escalation spec, engine, app, tests and docs, and the restated learner property (commits marked "by Kiro" from 2026-11-19 on) | Kiro (sessions B to F) |
| One word in `.kiro/settings/mcp.json` (`get-library-docs` to `query-docs`). kiro-cli refuses agent edits to that file, and the wrong name came from the developer's prompt | The developer |
| Running the shell and the checks, session prompts and notes, commit messages, this log and the README's "Built with Kiro" section | The developer |
| EARS rewrite of every criterion, the task audit and seven gap tasks | Kiro (session A) |
| The late-ACK learner, the geocoder port, both geocoders, the relay's `/geocode` route and their tests | Kiro (session A) |
| Conversion of four hooks to the current format | Kiro (session A) |
| Steering, the first spec draft and the first build (engine, pager UI, time machine, .ics import, relay) | The developer, in Kiro's spec format, task by task from `tasks.md` |
| Everything after session A (tasks 34-45: relay hardening, the receipt, the before/after card, the boot sequence, the 666 haunting, the purity guard, the custom agent, the MCP settings, the phone fit, the 60-second demo, the write guard, the traceability test, the ignore-it replay with the next morning's rebook page, the thermal receipt with the silence line, and the correctness properties) | The developer, each recorded as a checked task with its criteria |
| Running the Playwright suite after the session | The developer |

## Sessions
- [Session A](docs/kiro-sessions/2026-11-19-session-a.md), 2026-11-19: spec review, tasks 25 and 26, hook conversion. 13 min 2 s, 22.34 of 4,000 bonus credits, exit code 0. The exact prompt, every changed file and what was left open are in the record.


The on-call escalation feature. Every session ran `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command` (plus `@context7` in session E, and `--agent revenant-engine` in session C), with `PW_PORT=3850` and a 25-minute cap. The exact prompts and output are in each record.

| Session | Work | Minutes | Credits | Ended |
|---|---|---|---|---|
| [B](docs/kiro-sessions/2026-11-19-session-b-escalation-spec.md) | Wrote the spec: requirements, design, tasks | 16.5 | 9.64 | on its own |
| [C](docs/kiro-sessions/2026-11-19-session-c-escalation-engine.md) | Engine, tasks 1 to 10 (revenant-engine agent) | 36.0 | 8.23 | stopped at the cap |
| [C2](docs/kiro-sessions/2026-11-19-session-c2-escalation-tests.md) | Engine tests and properties | 26.1 | 10.52 | stopped at the cap |
| [D](docs/kiro-sessions/2026-11-19-session-d-guard-fix.md) | Write-guard fix, start of task 12 | 56.0 | 4.71 | stopped at the cap |
| [D2](docs/kiro-sessions/2026-11-19-session-d2-guard-probe.md) | Guard probe refused; tasks 12 and 13 started | 27.6 | 5.45 | stopped at the cap |
| [E1](docs/kiro-sessions/2026-11-22-session-e1-two-pagers.md) | Tasks 12 to 16: two pagers, settings, day sheet | 11.3 | 8.11 | on its own |
| [E](docs/kiro-sessions/2026-11-22-session-e-browser-tests.md) | Tasks 17 to 21: replay, relay guard, docs, 10 browser tests, Context7 | 23.3 | at most 39.01 | on its own |
| [F](docs/kiro-sessions/2026-11-22-session-f-learner-property.md) | Traced a fast-check counterexample in an older property to a property stated more strongly than criteria 9.6 and 9.13; restated it and added a regression test | 6.4 | 2.07 | on its own |

Credits for sessions B to E are the change in the account balance across each session. Other Kiro work drew on the same balance while session E ran, so its figure is an upper bound. Session F's figure comes from kiro-cli's own `session_usage` event in `--output-format stream-json`, which is exact.

Sessions C to D2 ran while the laptop slept with its lid closed, which is why they hit the cap with little done. Wall-clock minutes for those overstate the working time. The first engine commit was checked again from a fresh clone once the machine stayed awake.

Hooks: sessions B to E were recorded as plain text, which does not show hook runs, so this log does not claim any hook fired in them. The write guard's refusal in session D2 shows as the tool's own failure. Session F was recorded with `--output-format stream-json`, whose `hook_update` events show the workspace hooks running: the engine write guard 4 times, unit tests on save 3 times and the typecheck-and-unit check on stop once, all completed.
