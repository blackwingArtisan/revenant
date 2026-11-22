# Kiro session F: an older property promised more than its criterion

- Tool: kiro-cli 3.5.0, v3 engine, non-interactive
- Command (repo root, stdin closed): `PW_PORT=3850 kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command --output-format stream-json "<prompt>" </dev/null` (not `--trust-all-tools`)
- When: 2026-11-22, 19:10:56 to 19:17:22 UTC (6 min 26 s wall time, under a 25-minute cap); exit code 0
- Credits used: 2.07 (kiroween2026 `/usage` read 433.43 before and 438.20 after)
- Finished on its own in 6 min 26 s (exit code 0). 2.07 credits, read from this session's own `session_usage` event in kiro-cli's stream-json output. Other agents were using the same credit pool at the time, so the balance moved by 4.77.
- The task: a fresh-clone run had hit a fast-check counterexample (seed 363408089) to an older property, "never adds a page when a prep-time suggestion is applied (Req 9.6)". It also fails on the commit before any escalation work.
- Kiro's finding: the engine was correct, and the property promised more than criteria 9.6 and 9.13 do. A longer prep time can move one get-ready page above another for the same budget slot, so the page count stays the same but an id changes. Kiro restated the property and its design.md row to match the criteria (the count never rises, and a new id is only the get-ready page of a commitment that already had prep time). It added a hand-built regression test. It reported that this test passes with or without the property change, because the engine did not change.
- Hooks, on the record: this was the first session recorded with `--output-format stream-json`, which reports hook runs. The workspace hooks fired 8 times: the engine write guard (PreToolUse) 4 times, unit tests on save 3 times, and the typecheck-and-unit-tests check on stop once, all with status completed. The `[hook]` lines below are those events.
- One of Kiro's edits used a wrong parameter name, and Kiro retried it.
- MCP: none called.

## Prompt

```text
You are working in the Revenant repository. Read .kiro/steering/*.md, then .kiro/specs/time-blind-paging/requirements.md (Requirement 9, the late-ACK learner, especially criterion 9.6) and design.md's correctness properties, src/engine/learn.ts, src/engine/plan.ts and tests/unit/properties.test.ts.

A fresh-clone test run found a counterexample to the property "never adds a page when a prep-time suggestion is applied (Req 9.6)" in tests/unit/properties.test.ts. It reproduces every time with fast-check seed 363408089, and it fails the same way on the commit before the on-call escalation work, so it is an older bug and not caused by escalation. The failure is `c4:get-ready: expected false to be true`: after a suggestion is applied, the plan contains a page id that was not in the plan before. The shrunk counterexample has several all-day "must" appointments at the same time, a "normal" online Standup with 5 minutes of prep (c4) and a "must" online Standup with 20 minutes of prep (c6).

Do these jobs in order.
1. Reproduce it: temporarily pass `{ ...RUNS, seed: 363408089 }` to that one fc.assert and run `npx vitest run tests/unit/properties.test.ts`. Then remove the seed again.
2. Find the cause. Decide whether the engine breaks criterion 9.6 (applying a suggestion must never add a page) or whether the property is stated more strongly than the criterion. Quote the criterion text in your answer.
3. Fix the real cause with the smallest change. If it is the engine, fix the engine and keep the property as it is. If the property is wrong, correct the property and the matching line in design.md so both say exactly what 9.6 says, without weakening what 9.6 promises.
4. Add a unit test with the shrunk counterexample built by hand (no seed), named with "(Req 9.6)", that fails before your fix and passes after it.
5. Run `npm run check` three times and report the counts each time. Then run `PW_PORT=3850 npx playwright test` once (always set PW_PORT=3850).

Rules: edit only with the file write and replace tools, never with sed or shell redirection. Do not run git. Do not add or upgrade dependencies or run npm install. Do not call any network service. Leave README.md and KIRO-LOG.md alone.

Finish with a short summary: the cause, the criterion text, the files you changed, and the test counts.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed, and local paths are shortened; nothing else is edited.

```text
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Replace in File

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/engine-write-guard.json#hook-0", "operationId": "8ac1bf92-0501-4dfa-8c69-f3ff5472a37e", "name": "Engine write guard", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/test-on-save.json#hook-0", "operationId": "7303fd6e-f733-41cc-93c0-eb7a4d9e0a94", "name": "Run unit tests on source save", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[tool] Run Command
[tool] Run Command
[tool] Replace in File

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/engine-write-guard.json#hook-0", "operationId": "1ad79eb6-68fd-427b-8a3d-489afb7181ce", "name": "Engine write guard", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[tool] Replace in File

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/engine-write-guard.json#hook-0", "operationId": "d322857e-fff1-46d0-bd70-ab476aa715ec", "name": "Engine write guard", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/test-on-save.json#hook-0", "operationId": "7c075afa-455a-4179-a3be-c1edffc3121b", "name": "Run unit tests on source save", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[tool] Run Command
[tool] Run Command
Retrying the edit with the correct parameter name.
[tool] Replace in File

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/engine-write-guard.json#hook-0", "operationId": "a6c299dc-bedd-4d1f-9332-132bd69beb17", "name": "Engine write guard", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[tool] Run Command

[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/test-on-save.json#hook-0", "operationId": "3995571d-7b8f-4133-b910-85364f5f4e17", "name": "Run unit tests on source save", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[tool] Run Command
[tool] Run Command
[tool] Run Command
The engine was fine. The property was stated more strongly than criterion 9.6. I corrected the property and the matching line in `design.md`, and made no engine change.

**Reproduction.** With seed 363408089 the property failed with `c4:get-ready: expected false to be true`. I removed the seed afterwards.

**Cause.** The daily budget ranks pages of the same priority and kind by `fireAt`, earliest first. In the counterexample, the two "Standup" appointments (c4 and c6) form one routine, and the suggestion raises both prep times. c4's get-ready page then fires earlier than the get-ready page of c7, another "normal" online appointment (10 minutes of prep). So c4's page takes the budget slot c7's page held, and c7's page drops to the digest. The page count and the beeping count stay the same, but one id is new. The property wrongly required that no id be new.

**Criterion 9.6:** "IF the routine's current prep time is zero, THEN THE SYSTEM SHALL NOT suggest a prep time, so that a suggestion never adds a page." Criterion 9.13 adds: "WHEN a suggestion is applied, THE SYSTEM SHALL NOT change the number of beeping pages." The engine meets both.

**Fix.** The property now asserts three things:
- The page count never rises.
- Any new page id is a get-ready page.
- That get-ready page belongs to a commitment that already had prep time.

The `design.md` row now says the same and cites 9.6 and 9.13. This is no weaker on adding pages: a commitment with no prep time still never gets a page.

**Files changed:**
- `tests/unit/properties.test.ts`
- `.kiro/specs/time-blind-paging/design.md`
- `tests/unit/learn.test.ts`: new test "applying a suggestion never raises the page count, only re-ranks get-ready pages (Req 9.6)". It builds the counterexample by hand with no seed and checks that c4's get-ready replaces c7's.

**Fail-before-fix:** the new unit test passes both before and after the property change, because the engine did not change. It did not fail first. The seeded run was the failing check, and it now passes.

**Tests:** `npm run check` gave 23 files and 315 passed, 1 skipped (316), on all three runs. `PW_PORT=3850 npx playwright test` passed 41 of 41.
[hook] {"sessionUpdate": "session_info_update", "_meta": {"kiro": {"hook": {"hookId": ".kiro/hooks/check-on-stop.json#hook-0", "operationId": "63c60bc4-b7fb-4824-96d1-029861876824", "name": "Typecheck and unit tests on stop", "status": "completed", "actionType": "runCommand"}, "kind": "hook_update"}}}

[run] success (end_turn)
```
