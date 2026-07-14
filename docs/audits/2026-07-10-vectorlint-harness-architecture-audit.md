# VectorLint Harness Architecture Audit

> **HISTORICAL AUDIT.** This audit records the July 2026 decision that led to
> the bounded harness refactor. Agent mode was an unreleased internal
> implementation path with no public users; this audit records the decision to
> remove it before shipping it as a public contract. Some "current state"
> observations below describe the pre-refactor code. For the shipped architecture, see
> [`../specs/2026-07-10-harness-architecture.md`](../specs/2026-07-10-harness-architecture.md).

Date: 2026-07-10

Status: Objective system audit plus product-direction audit. Request changes before shipping the current autonomous workspace-agent surface as a public contract.

## Product Decision

VectorLint should not keep the current autonomous workspace-agent mode.

The retained agent-like capability should be a constrained reader executor: a model or headless agent can read the target content in sections when that is useful for context management, but it should not search the workspace, inspect arbitrary files, perform top-level workspace checks, or rewrite the rule being evaluated.

The intended execution model is:

- `direct`: send target content and rule in one structured review call.
- `reader`: give the executor a read-section capability over the target content only.
- `auto`: choose `direct` for normal-sized inputs and `reader` for large inputs or explicit context-management needs.

This is an execution strategy decision, not a return to VectorLint-as-agent.

## Product Direction Under Review

VectorLint should become a programmable, bounded, on-page content review harness that another caller can invoke.

The caller can be Codex, Claude Code, another coding agent, CI, a local CLI wrapper, or a future service. That caller owns exploration, cross-page reasoning, research, and context gathering. VectorLint owns the constrained review of target content against source-backed rules and returns structured findings, scores, diagnostics, and usage metadata.

In practical terms:

- VectorLint reviews the target page or explicitly supplied content.
- External context is caller-supplied, not discovered by VectorLint.
- Rules define review behavior, granularity, severity, and scoring constraints.
- Executors can be API models, headless local agents, or constrained reader executors, but they receive the same review request contract.
- VectorLint should not expose a model-controlled workspace tool loop as its core product surface.

## Objective System Audit Summary

Separate from product direction, the current codebase has several system-level liabilities:

- Build health is weak: `npx tsc --noEmit`, `npm run lint`, and parts of `npm run test:run` fail in the current workspace.
- Runtime contracts are duplicated across hand-written TypeScript, JSON-schema objects, Zod schemas, and formatter-specific shapes.
- Standard mode and agent mode project the same underlying findings differently.
- CLI orchestration owns too many responsibilities: config, file matching, evaluation, scoring, output formatting, debug artifacts, and agent routing.
- Evidence verification and counting are inconsistent enough to affect exit behavior.
- Observability and debug paths can record full prompts, content, and outputs.
- Documentation and implementation disagree on the current agent-mode topology and tool contracts.

## Architecture Verdict

The current codebase contains two execution models at once:

1. The older evaluator path: one structured model call per rule or chunk.
2. The newer autonomous workspace-agent path: VectorLint gives a model tools to read/search the workspace and call lint as a nested tool.

The second path should not continue as-is. The useful piece is not "agent mode" broadly; it is target-aware reading for context management. The current implementation also duplicates result projection, scoring, evidence validation, output formatting, and configuration behavior from the first path. That is why the architecture feels harder to maintain: the code is not just messy; it is serving two different ownership models.

The highest-leverage change is to define a neutral review-domain contract and make every executor implement that contract.

## Proposed Core Contract

The contract should be centered on review, not providers or agents.

```ts
interface ReviewRequest {
  target: ReviewTarget;
  rules: ReviewRule[];
  context?: ReviewContext[];
  budget: ReviewBudget;
  outputPolicy: ReviewOutputPolicy;
}

interface ReviewExecutor {
  run(request: ReviewRequest): Promise<ReviewResult>;
}

interface ReviewResult {
  findings: ReviewFinding[];
  scores: ReviewScore[];
  diagnostics: ReviewDiagnostic[];
  usage?: ReviewUsage;
}
```

API models, reasoning models, and headless CLI agents become adapter implementations behind this contract. The CLI becomes orchestration around request creation, result formatting, and exit behavior.

## Major Findings

### 1. The Current Agent Surface Is Broader Than The Decided Execution Model

Evidence:

- `README.md:148` presents `--mode agent` as autonomous cross-file review mode.
- `src/agent/prompt-builder.ts:43` instructs the model to perform workspace-level checks.
- `src/agent/executor.ts:670` exposes `read_file`.
- `src/agent/executor.ts:715` exposes `search_content`.

Impact:

VectorLint still behaves like it owns exploration. That puts it in competition with external coding agents instead of becoming a harness those agents can use. It also overshoots the decided reader-executor model, which only needs target-scoped reading for context management.

Recommendation:

Remove the current autonomous workspace-agent surface. Preserve only a constrained reader executor if needed:

- It may read sections of the target content.
- It may not search the workspace.
- It may not read arbitrary files.
- It may not perform top-level workspace findings.
- It may not override source-backed rules.

### 2. The Provider Interface Mixes Structured Review With Autonomous Tool Loops

Evidence:

- `src/providers/llm-provider.ts:28` requires both `runPromptStructured` and `runAgentToolLoop`.
- `src/providers/vercel-ai-provider.ts:136` implements the agent loop on the same provider.
- `src/agent/executor.ts:796` depends on the provider-level agent loop.

Impact:

Every future executor has to pretend to be both a structured model provider and an autonomous agent runner. That is the wrong abstraction for headless CLI support and for a constrained reader executor.

Recommendation:

Split the contracts:

- `StructuredModelClient` for API structured output.
- `HeadlessReviewExecutor` for local CLI agents.
- `ReaderReviewExecutor` for target-scoped read-section execution.
- `ReviewExecutor` as the stable domain-level interface.
- `TelemetrySink` or observability decoration as an optional cross-cutting concern.

### 3. Runtime Type Contracts Are Not Strong Enough For A Harness

Evidence:

- `src/providers/vercel-ai-provider.ts:119` returns `output as T`.
- `src/providers/llm-provider.ts:9` defines tool input and output as `unknown`.
- `src/agent/tools-registry.ts:21` exposes tools without typed output contracts.
- `npx tsc --noEmit` currently fails in core files.

Impact:

The code presents types as guarantees, but several are only assertions. A programmable harness needs reliable runtime validation because external callers and headless adapters will depend on these contracts.

Recommendation:

Tie structured execution to concrete Zod schemas or canonical parsers. Introduce typed tool contracts only if tools remain. Add a `typecheck` script and wire it into CI and build.

### 4. Standard Mode And Agent Mode Project Results Differently

Evidence:

- `src/cli/orchestrator.ts:626` derives standard check severity from scoring.
- `src/agent/executor.ts:431` stamps agent findings with prompt severity.
- `src/agent/executor.ts:598` flattens judge criteria before recording findings.
- `src/cli/orchestrator.ts:1216` builds agent scores only for line output.
- `src/cli/orchestrator.ts:1237` emits structured output without agent scores or diagnostics.

Impact:

The same underlying review can produce different severity, rule identity, score data, JSON shape, and exit behavior depending on mode. That makes VectorLint hard to trust as a machine-facing gate.

Recommendation:

Extract one shared result projection pipeline:

```text
PromptEvaluationResult
  -> verified findings
  -> rule and criterion identity
  -> severity and score
  -> diagnostics
  -> output formatter
```

Every executor should return into this pipeline.

### 5. The On-Page Boundary Is Not Enforced

Evidence:

- `src/agent/executor.ts:585` lets `lint` resolve any file inside `workspaceRoot`.
- `src/agent/executor.ts:670` lets `read_file` read any workspace file.
- `src/agent/executor.ts:715` lets `search_content` scan workspace content.
- `src/agent/executor.ts:134` allows model-supplied `reviewInstruction`.
- `src/agent/executor.ts:583` replaces the source-backed prompt body with the model-supplied override.

Impact:

Prompt-injected page content can indirectly steer the model to read non-target files or rewrite the rule being evaluated. That breaks deterministic review semantics and creates privacy and security risk.

Recommendation:

For the new harness, enforce a target/context allowlist:

- Target content is always in scope.
- Caller-supplied context is in scope.
- Workspace reads are out of scope unless the caller explicitly includes those files as context.
- Reader execution can page through target content only.
- Rule bodies are source-backed and caller-authored, not model-authored.

### 6. Evidence Handling Can Misreport Findings

Evidence:

- Standard mode skips unverifiable quotes but can still count original surfaced violation totals in some paths.
- `src/agent/executor.ts:415` attempts to locate evidence.
- `src/agent/executor.ts:426` falls back to the model-provided line when location fails.

Impact:

Standard mode can fail a run without printing the issue that caused the failure. Agent mode can surface hallucinated evidence as if it were verified.

Recommendation:

Use one evidence verifier. Count only emitted, verified findings. If evidence cannot be located, return a diagnostic and either skip the finding or mark the run operationally failed.

### 7. Cost And Work Are Not Bounded Enough

Evidence:

- `src/providers/vercel-ai-provider.ts:161` defaults agent loops to 1000 steps.
- `src/agent/executor.ts:577` allows repeated nested `lint` calls.
- `src/evaluators/base-evaluator.ts:213` runs one model call per chunk.
- `src/agent/executor.ts:680` and `src/agent/executor.ts:715` glob before applying result caps.

Impact:

A single review can multiply cost through agent steps, nested lint calls, rules, chunks, and workspace search. Even a constrained reader executor will be slower than a direct call, so `auto` must have clear thresholds and budgets.

Recommendation:

Add explicit budgets:

- Max target bytes.
- Max caller context bytes.
- Max chunks per rule.
- Max model calls per review.
- Max findings per rule.
- Max wall-clock duration.
- Max headless executor retries.

### 8. Documentation Still Points At The Old Product

Evidence:

- `README.md:148` documents autonomous workspace-agent mode.
- `docs/specs/2026-03-17-agentic-capabilities-design.md:24` frames the roadmap around cross-document agent mode.
- The same spec describes implementation details that are not true now: one agent per rule, final `AgentFindingSchema`, AbortSignal propagation, ripgrep JSON, and Vale JSON omission of agent findings.

Impact:

Future contributors will optimize toward the wrong architecture and trust contracts that the code does not implement.

Recommendation:

Mark the agentic spec superseded. Replace it with a harness architecture spec that defines the review request, context boundary, executor interface, output contract, and internal removal plan for unreleased agent-mode paths.

### 9. Secrets And Sensitive Content Need Better Handling

Evidence:

- `src/config/global-config.ts:13` says the global config stores API keys.
- `src/config/global-config.ts:76` creates the config directory with default permissions.
- `src/config/global-config.ts:81` writes the config file with default permissions.
- `src/observability/langfuse-observability.ts:66` records inputs.
- `src/observability/langfuse-observability.ts:67` records outputs.
- `src/providers/vercel-ai-provider.ts:59` can log full prompts and content.

Impact:

Provider keys, unreleased docs, caller context, and model outputs can leak through filesystem permissions, telemetry, debug logs, or persisted artifacts.

Recommendation:

Use private file modes for config and review artifacts. Make payload telemetry a separate opt-in from metadata telemetry. Add redaction or safe debug modes.

## Verification Results

Commands run from `/Users/klinsmann/Projects/TinyRocketLabs/vectorlint`:

```bash
npm run lint
npm run test:run
npx tsc --noEmit
```

Results:

- `npm run lint` failed before linting because typed ESLint rules were applied to a `.cjs` research script without parser type information.
- `npm run test:run` passed most tests but failed 4 suites during module resolution for `ora` and `@langfuse/otel`.
- `npx tsc --noEmit` failed with contract errors in agent, orchestrator, observability, logging, and provider modules.

## Recommended Refactor Sequence

### Phase 1: Stop The Bleeding

1. Remove or hide the current autonomous workspace-agent mode.
2. Fix `tsc --noEmit`.
3. Fix test module resolution.
4. Fix lint configuration for non-TypeScript research scripts.
5. Add `typecheck` to CI and build validation.

### Phase 2: Define The Harness Contract

1. Create a neutral review-domain module.
2. Define `ReviewRequest`, `ReviewRule`, `ReviewContext`, `ReviewBudget`, `ReviewFinding`, `ReviewScore`, and `ReviewDiagnostic`.
3. Define target/context boundary rules.
4. Define structured output shape once.
5. Define execution strategy: `direct`, `reader`, and `auto`.

### Phase 3: Share Result Projection

1. Extract evidence location and verification.
2. Extract filtering.
3. Extract severity and scoring.
4. Extract output formatter inputs.
5. Make standard mode and any executor mode use the same projection path.

### Phase 4: Replace The Agent Loop With Executors

1. Keep API model execution as direct execution.
2. Add target-scoped reader execution as another executor.
3. Add headless CLI execution behind the same review contract if still useful.
4. Pass the same review request to each executor.
5. Remove model-controlled rule overrides.
6. Remove workspace read/search tools from core review.

### Phase 5: Update Documentation

1. Mark the agentic capabilities spec superseded.
2. Write a new harness architecture spec.
3. Update README and CLI docs.
4. Document the bounded harness architecture that replaces the unreleased autonomous workspace-agent implementation path.

## Suggested Target Architecture

```text
CLI / API / External Agent
  -> ReviewRequestBuilder
  -> ReviewExecutor
       -> ApiModelExecutor
       -> ReaderExecutor
       -> HeadlessCliExecutor
  -> ResultProjection
       -> EvidenceVerifier
       -> ViolationFilter
       -> ScoreCalculator
       -> Diagnostics
  -> OutputFormatter
       -> line
       -> json
       -> rdjson
       -> vale-json
```

The important inversion is that VectorLint no longer asks, "What tools should this agent use?" It asks, "Given this target, these rules, this context, this execution strategy, and this budget, what findings can be verified?"

## Final Recommendation

The decided direction is cleaner than the current architecture. The current pain is not a sign that VectorLint is too complex; it is a sign that the codebase is carrying two ownership models and several duplicated runtime contracts.

Make VectorLint the harness. Let external agents be agents. Keep reader execution only as a bounded way to manage target-content context.

---

## Appendix: Phase 1 — Completed (2026-07-13)

Phase 1 of the recommended refactor sequence ("Stop The Bleeding") landed on branch `codex/ci/harness-stop-the-bleeding`. It shifts the verification baseline recorded in "Verification Results" above and addresses Finding 1 at the CLI boundary.

**Shifted baseline.** The 2026-07-13 pre-work capture differed from the original verification results: `npm run lint` and `npm run test:run` already passed, so the earlier lint failure and the four `ora` / `@langfuse/otel` module-resolution failures were stale. Only `npx tsc --noEmit` was still failing. Phase 1 cleared those remaining type errors (narrowed at boundaries; no strict compiler options relaxed) and added durable gates so the baseline cannot silently regress:

- `npm run typecheck` (`tsc --noEmit`) and `npm run verify` (typecheck + lint + test:run) scripts.
- `vitest.config.ts` for stable test module resolution.
- `docs/research/**` excluded from linting.
- `.github/workflows/typecheck.yml` and `.github/workflows/test.yml` aligned to Node 20.

**Current state at audit time.** `npm run verify`, `npm run build`, and built-CLI standard review smoke runs are green. Per Finding 1, the unreleased autonomous workspace-agent surface is quarantined at the CLI boundary: `--mode` is blocked so internal agent-mode wiring cannot be reached from the CLI. `src/agent/*` and the agent-mode helpers are retained as compile-only quarantine, unreachable from the CLI, pending removal in Phase 4. A pointer to this audit lives in the README `## Agent Mode` section and the `--mode` help text.

This appendix records completion only. Findings 2–9 and the proposed core contract remain owned by Phases 2–5; no spec or architecture document is superseded here.
