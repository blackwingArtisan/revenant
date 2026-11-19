# Kiro session B: on-call escalation spec

- Tool: kiro-cli 3.5.0, v3 engine, non-interactive
- Command (repo root, stdin closed): `PW_PORT=3850 kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command "<prompt>" </dev/null` (not `--trust-all-tools`)
- When: 2026-11-19, 13:24:03 to 13:40:34 UTC (16 min 31 s wall time, under a 25-minute cap); exit code 0
- Credits used: 9.64 (kiroween2026 `/usage` read 314.45 before and 324.09 after)
- Environment: `PW_PORT=3850` was set for the whole session (no Playwright run was needed).
- MCP: none called. This session pinned the two servers in `.kiro/settings/mcp.json`; a server change loads only in the next session.
- Hooks: no hook output appears in this session. No source file was saved and the Stop hook's `npm run check` printed nothing to the transcript, so this record does not claim a hook ran.
- One model stream stalled for 5 minutes after `requirements.md` was written (`Model stream stalled: no data received for 300000ms`); kiro-cli retried on its own and Kiro finished the design and tasks.
- Kiro ran `git status` once, which the prompt asked it not to do, and said so in its summary. It changed nothing.
- Files Kiro wrote: `.kiro/specs/on-call-escalation/requirements.md` (12 requirements, 71 EARS criteria), `design.md`, `tasks.md` (21 tasks, 63 sub-tasks), and the version pins in `.kiro/settings/mcp.json`. The developer changed none of them.

## Prompt

```text
You are working in the Revenant repository (a pager PWA for people with ADHD; TypeScript, React 19, Vite, Vitest with fast-check, Playwright with axe-core). Read .kiro/steering/product.md, tech.md and structure.md first and follow them, especially the pure-engine rule. Then read .kiro/specs/time-blind-paging/requirements.md, design.md and tasks.md, src/engine/alerts.ts, plan.ts, runtime.ts, haunt.ts, report.ts, types.ts and codes.ts, tests/unit/traceability.test.ts and tests/unit/properties.test.ts, so the new spec names the real modules.

Write a new Kiro spec for one headline feature, on-call escalation to a secondary, into .kiro/specs/on-call-escalation/: requirements.md, design.md and tasks.md. Do not write any code in this session.

The feature ("PagerDuty, for people who are the incident"): the user may opt in to a named secondary on call (for example a partner, a roommate or a coach; the name is typed by the user, off by default). IF a leave-now (911) page is still unacknowledged after its last repeat THEN Revenant pages the secondary on a second on-screen pager labelled "SECONDARY ON CALL", with a plain message saying who missed what and when it starts. The escalation counts against the daily silence budget and must never make the beeping pages of a day exceed settings.dailyBudget. Decide in the design how the budget makes room (for example reserve a slot, or decide when planning which pages may escalate) and say why. An ACK on the primary pager before the escalation instant cancels it; the secondary pager has its own ACK. The escalation must also appear in the existing "See what happens if you ignore it" replay, so the ignored 911 escalates to the secondary before the 666 haunting. This pass is on-screen only: nothing is sent to a real person, no SMS, no network call; record sending through the relay as an out-of-scope follow-up.

requirements.md: an introduction, a glossary (secondary, escalation instant and any new terms), user stories, and numbered acceptance criteria in strict EARS form (WHEN / WHILE / IF ... THEN / WHERE ... THE SYSTEM SHALL ...), one testable behavior each, numbered "1.1", "1.2" and so on under "## Requirement N: <title>" headings, the same numbering style as time-blind-paging so the same traceability checker can read it. Cover: opting in and out and the name (with validation: trimmed, non-empty, a length cap, stored locally only), which pages escalate, the escalation instant, the message text and code, the budget rule, ACK on either pager, the day sheet and receipt showing an escalation, the ignore-it replay, persistence across reload, keyboard access and zero axe violations, reduced motion, and determinism (no clock or randomness in the engine).

design.md: overview, the components and the exact files to add or change (a pure engine module such as src/engine/escalate.ts, the types, the planner or budget change, the runtime, the app hook and components, settings and storage), data models in TypeScript, the algorithm with a worked example on the sample day, a mermaid diagram, error handling, at least three correctness properties to check with fast-check (including "escalation never makes a day's beeping pages exceed the budget" and "an ACK before the escalation instant means no escalation"), and the testing strategy. Note any open questions at the end with your recommended default.

tasks.md: a numbered "- [ ]" checklist where every task and sub-task ends with "(Req N.M, ...)" naming the criteria it satisfies, the same format as time-blind-paging/tasks.md. Split the tasks into two groups with headings: "Session A: engine" (pure engine module, types, budget, runtime, unit and fast-check property tests; only files under src/engine, tests/unit and .kiro/specs) and "Session B: app" (settings form, storage, the second pager component, day sheet and receipt, the ignore-it replay wiring, README and docs, Playwright tests with axe). Include a task in Session A to extend tests/unit/traceability.test.ts so it checks every folder under .kiro/specs, not only time-blind-paging (the time-blind-paging thresholds must still hold for that folder). Every criterion must be claimed by at least one task.

Rules: work only inside this repository; do not add, remove or upgrade npm dependencies; do not run npm install; do not run git; do not deploy or call AWS or any network service. Keep wording professional and use invented sample data only. Leave README.md and KIRO-LOG.md alone in this session.

One small housekeeping edit outside the spec: .kiro/settings/mcp.json starts both MCP servers at @latest. Pin them to exact versions, awslabs.aws-documentation-mcp-server@1.2.4 and @upstash/context7-mcp@4.5.0, and put the read-only documentation tools of each server in its autoApprove list (aws-docs: read_documentation, search_documentation, recommend; context7: resolve-library-id, get-library-docs). Keep everything else in that file as it is.

Finish with a short summary: the three files, the number of requirements, criteria and tasks, the budget decision, and the open questions.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed, and local paths are shortened; nothing else is edited.

```text
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] Run Command
[tool] Run Command
[tool] Run Command

I wrote the three spec files and pinned the two MCP servers. I didn't run `npm run check`, so `tests/unit/traceability.test.ts` hasn't read the new spec yet. A throwaway Python script that does the same matching found every criterion claimed and no unknown references.

I didn't change README.md or KIRO-LOG.md, and I made no code changes. I made no network calls and ran no `npm install`. One slip: I ran `git status` once by reflex. It's read-only and changed nothing, but it breaks your no-git rule.

**Files**
- `.kiro/specs/on-call-escalation/requirements.md`: 12 requirements and 71 criteria, all in WHEN / WHILE / IF…THEN / WHERE form.
- `.kiro/specs/on-call-escalation/design.md`: includes 8 fast-check properties, two mermaid diagrams and a worked example on the sample day with "Sam" as the secondary.
- `.kiro/specs/on-call-escalation/tasks.md`: 21 tasks and 63 sub-tasks. Session A is tasks 1–11 and Session B is tasks 12–21.
- `.kiro/settings/mcp.json`: servers pinned to `awslabs.aws-documentation-mcp-server@1.2.4` and `@upstash/context7-mcp@4.5.0`, with the autoApprove lists you gave. The rest of the file is unchanged.

**Budget decision**
- **What it does:** the planner reserves one slot per day before it ranks pages. The earliest must-priority leave-now page with room to escalate gets the slot, and every other page is ranked against `limit − 1`.
- **Why:** the plan stays deterministic, and an ACK never changes it. A "spare slot only" rule would never fire on the sample day, which is already 6 of 6. Making the escalation a ranked page could push out the very 911 it backs up.
- **Cost:** on the sample day with escalation on, the taxes 121 and the dinner 411 both go to the digest. The slot is never refunded, even if you ACK in time.
- **Limits:** one escalation per day, none if `dailyBudget` is below 2, and the slot is released if its 911 doesn't fit.

**Design details**
- **Escalation instant:** one minute after the last repeat of the 911. For the sample dentist that is 10:20 (cutoff 10:30), assuming a 16-minute drive. The design says a unit test should pin that figure.
- **Status type:** `PageStatus` is not widened. `cancelled` lives in a new `EscalationStatus`, so Session A keeps `src/app` compiling.
- **Spec check (task 10):** it also rejects whole-requirement references in this spec, so a single reference can't claim every criterion of a requirement.

**Open questions** (each has a recommended default in the design)
1. The message says "OWNER MISSED 911" because the app doesn't know the user's name. Keep it for this pass and add an optional name field with the SMS follow-up.
2. One escalation per day. Keep it.
3. The reserved slot is never refunded. Accept that.
4. Only `must` priority escalates. Keep it.
5. The secondary pager chirps once at a lower pitch and follows MUTE.
6. The S key acknowledges the secondary pager.
```
