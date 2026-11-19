# Kiro log

How Kiro is used on this project: what is in `.kiro/`, how it was produced, and what is still to come.

## What is in `.kiro/`
- **Steering** (`.kiro/steering/`): `product.md` (the thesis, who it is for, the non-negotiable paging rules), `tech.md` (stack, pure-engine rules, the adapter table), `structure.md` (where code lives and the checklist for adding a page kind or an external service). All three use `inclusion: always`.
- **Spec** (`.kiro/specs/time-blind-paging/`): `requirements.md` with eight requirements and numbered EARS acceptance criteria, `design.md` (architecture, components, data models, algorithms, error handling, testing strategy) and `tasks.md` (a checklist mapped to requirement numbers; 24 tasks done, 2 open).
- **Hooks** (`.kiro/hooks/`, all in Kiro's `.kiro.hook` format):
  - `test-on-save.kiro.hook`: runs the unit suite when a source or unit-test file is saved.
  - `page-budget-guard.kiro.hook`: when the planner, escalation, runtime or codes change, restates the paging rules (page at the action, the daily budget, a pure engine, ACK cancels repeats) and asks for a unit test.
  - `check-on-stop.kiro.hook`: typecheck and unit tests when the agent stops.
  - `codes-card-sync.kiro.hook`: when `codes.ts` changes, checks that the wallet code card and the README table still match.

## How it was produced
The steering files and the initial spec were drafted before the Kiro pass, in Kiro's spec format, and the build followed `tasks.md` task by task. Each requirement maps to unit tests (Vitest) or end-to-end tests (Playwright), listed in the design's testing strategy.

## Review fixes
A clean-clone review found the LCD message clipped on first view, no one-press way into the demo, a copy typo on the code card and no automated test for the service worker. Task 24 in `tasks.md` records the fixes, with new acceptance criteria 6.8, 6.9, 7.5 and 7.6.

## Kiro pass
Kiro's review of the steering, spec and hooks follows: open the repository in Kiro, let it load the steering, and ask it to check `requirements.md` against the code and tests and to plan tasks 25 and 26. Its output and any changes will be recorded here.
