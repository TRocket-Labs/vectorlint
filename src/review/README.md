# `src/review/` — Review-Domain Contract

The neutral, implementation-neutral contract every executor programs against.
A caller builds a `ReviewRequest`; an executor returns a `ReviewResult`.

## What lives here

- `types.ts` — all review-domain interfaces (`ReviewTarget`, `ReviewRule`,
  `ReviewContext`, `ReviewBudget`, `ReviewFinding`, `ReviewScore`,
  `ReviewDiagnostic`, `ReviewResult`, `ReviewRequest`, `ReviewModelCall`).
- `schemas.ts` — Zod schemas mirroring every external shape (boundary
  validation). All schemas are strict; legacy scoring-mode, rubric, and
  model-authored rule-override fields are rejected.
- `budget.ts` — `DEFAULT_REVIEW_BUDGET`, `REVIEW_BUDGET_SCHEMA`,
  `enforceBudget()`, and `BudgetExceededError` (extends `VectorlintError`).
- `boundary.ts` — `buildScope()` / `isInScope()` enforcing the on-page boundary.
- `executor.ts` — `ReviewExecutor` interface, `REVIEW_MODEL_CALLS`
  (`single | agent | auto`), `chooseModelCall()`.
- `request-builder.ts` — `buildReviewRequest()` bridging `PromptFile` to
  `ReviewRequest`.

## On-page boundary

- Target content is always in scope.
- Caller-supplied context is in scope.
- Workspace reads are out of scope unless the caller includes them as context.
- Agent model calls page through target content only.
- Rule bodies are source-backed and caller-authored, never model-authored.

## Execution strategy

`modelCall: single | agent | auto` selects how the reviewer model is invoked,
not how rules are scored. `single` sends target + rule in one structured call;
`agent` gives the executor a target-scoped read-section capability; `auto`
picks `single` for normal-sized inputs and `agent` for large ones.

## Wiring status

This module is additive and is **not** wired into the CLI yet. Future CLI
wiring can emit `ReviewResult` through shared finding processing and implement
executors behind `ReviewExecutor`.
