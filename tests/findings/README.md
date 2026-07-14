# Finding Processing — Test Coverage & Behavior Mapping

This directory owns the regression coverage for the **shared objective
violation-check finding-processing pipeline** (`src/findings/`). It documents
which behaviors moved out of `src/cli/orchestrator.ts` (and adjacent output
tests) into `src/findings/`, which behaviors were **intentionally removed**, and
which behaviors are **out of scope** for this phase.

The pipeline (`processFindings`) composes a single path:

```text
candidate findings ──▶ verify evidence ──▶ filter ──▶ dedupe ──▶ score ──▶ severity ──▶ ReviewResult
```

It is independent of model call (`single` / `agent` / `auto`) and carries no
`judge`, `evaluator`, rubric, or autonomous-agent compatibility path.

---

## Behavior-preservation mapping

| Behavior (origin) | Preserved by | Notes |
|---|---|---|
| Violation filtering / surfacing (`orchestrator.ts` `computeFilterDecision`) | `processor.test.ts` — *drops candidates that fail computeFilterDecision without a diagnostic*; *filtered candidates do not contribute to the score count* | Filter logic itself stays in `src/debug/violation-filter.ts`; the processor is a caller. `orchestrator-filtering.test.ts` still guards the end-to-end CLI surfacing. |
| Fuzzy finding-evidence location (`locateQuotedText`) | `finding-evidence-verifier.test.ts` — exact-quote location, warn diagnostic on miss, **no model-line fallback**, anchors without a line hint, diagnostic names the quoted text | One verifier (audit Finding #6). The agent path's model-line fallback is **not** preserved (see Removed). |
| Verified-finding counting & density scoring (`calculateCheckScore`) | `scorer.test.ts` — same numeric result as `calculateCheckScore`; score driven by verified count, not raw candidate count; resolves error severity; forwards strictness/severity | `scorer.ts` is a thin wrapper; no reimplemented math. |
| Severity + rule-id attribution | `severity.test.ts` — `resolveSeverity`, `buildRuleId` (`Pack.Rule` / `Pack.Rule.Criterion`), `resolveCriterionId`; `processor.test.ts` — stamps severity, attributes to pack rule / criterion | One severity path; one rule-id builder (audit Finding #4). |
| Golden check output (byte-for-byte) | `processor.test.ts` — *produces byte-for-byte findings/score matching the standard orchestrator path* | Proves no regression before the orchestrator was rewired (Task 2). |
| Unanchored-evidence diagnostics & exit behavior | `processor.test.ts` — *turns unanchored evidence into a warn diagnostic and emits no finding*; *counts only verified findings toward the score*; *does not set hadOperationalErrors for warn-level evidence diagnostics* | Intentional Phase 3 fix: unanchored quotes no longer flag the run as operationally failed. |
| Deduplication | `processor.test.ts` — *deduplicates verified findings by quoted_text and line* | |
| Contract / input boundary | `types.test.ts` — `FINDING_PROCESSING_INPUT_SCHEMA`, `RAW_VIOLATION_SCHEMA`, `PROMPT_META_FOR_FINDINGS_SCHEMA` parse supported input and reject legacy `evaluator`/`judge`/`rubric weight`/`agent`/`modelCall`/`mode`; `module-surface.test.ts` — public surface + diagnostic code constant | Strict Zod at the boundary; no `any`. |
| Formatter routing (line / JSON / RDJSON / Vale) | `orchestrator-check-processor.test.ts` — locatable findings + score + counts unchanged; verified findings through the JSON sink; unanchored quotes omitted from Vale JSON. `orchestrator-filtering.test.ts` — no dummy JSON/Vale issues when nothing is surfaced | End-to-end coverage of the rewired check path feeding existing formatters from `ReviewResult`. |

---

## Intentionally removed behavior (no replacement fixture)

These were legacy paths that the Phase 3 contract no longer supports. They are
covered by **rejection tests**, not behavior-parity tests.

| Removed behavior | Rejection coverage |
|---|---|
| Subjective `judge` / rubric criterion evaluation | `prompt-loader-validation.test.ts` — *Judge boundary rejection (Phase 3)* rejects `type: judge` and the `subjective` alias at the loader boundary; `orchestrator-filtering.test.ts` — *rejects judge/rubric results instead of projecting them as check findings* |
| Legacy `evaluator` / `judge` / rubric criteria in the review contract | `review/types.test.ts` — *rejects legacy evaluator and judge criteria fields*; `findings/types.test.ts` — input contract rejects judge/evaluator/rubric shapes |
| Agent finding-evidence model-line fallback | `finding-evidence-verifier.test.ts` — *never returns a finding whose line came from the model when the quote did not anchor* (the removed behavior is asserted as absent) |

Judge criterion output behavior (1–4 rubric, weighted average) has **no**
replacement fixture in this phase. Objective rule coverage belongs to the
objective-check test inventory, not a ported rubric.

---

## Out of scope for Phase 3 (Phase 4 territory)

These are **not** behavior-preservation targets for this phase and are
intentionally left untouched:

- `tests/agent/*`, the orchestrator test covering legacy agent output, and
  `tests/providers/*agent-loop*.test.ts` — the unreleased internal autonomous agent implementation.
  Phase 4 deletes or replaces these with agent-model-call executor tests.
- `BaseEvaluator`'s internal judge mode (`runJudgeEvaluation`),
  `buildJudgeLLMSchema` (`src/prompts/schema.ts`), the judge scoring helpers in
  `src/scoring/`, `tests/scoring-types.test.ts`, and the judge cases in
  `tests/prompt-schema.test.ts` — evaluator internals that are now **unreachable
  from the CLI** (judge prompts fail to load) but are scheduled for deletion in
  Phase 4 (executors / provider interface / agent deletion).

Phase 3 added **no** compatibility code for the unreleased/internal agent implementation — no
agent tool-loop wiring, no review-instruction handler, and no agent result
projection — to `src/findings/`.

---

## Files

| File | Covers |
|---|---|
| `finding-evidence-verifier.test.ts` | Single evidence verifier; no model-line fallback. |
| `severity.test.ts` | `resolveSeverity`, `buildRuleId`, `resolveCriterionId`. |
| `scorer.test.ts` | `scoreCheck` numerics vs `calculateCheckScore`; verified-count scoring. |
| `types.test.ts` | Zod input contract: parses supported input, rejects legacy shapes. |
| `processor.test.ts` | `processFindings` golden output, diagnostics, counting fix, dedupe, rule-id attribution, `ReviewResult` validation. |
| `module-surface.test.ts` | Public barrel surface + stable diagnostic code constant. |
