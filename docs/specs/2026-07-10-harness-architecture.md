# VectorLint Harness Architecture

Status: Current as of the bounded harness refactor.

Related audit: [`2026-07-10-vectorlint-harness-architecture-audit.md`](../audits/2026-07-10-vectorlint-harness-architecture-audit.md)

## Purpose And Product Direction

VectorLint is a bounded content review harness. External callers, such as Codex, Claude Code, CI jobs, scripts, or humans at the CLI, own exploration and decide what content to review. VectorLint owns constrained review of supplied target content against source-backed rules.

This means VectorLint is not a workspace agent. It does not search arbitrary files, expand scope on its own, rewrite content, or let a model override the rule it is supposed to enforce. It receives target content, rules, optional caller-supplied review context, budgets, and output policy, then returns structured review results.

Use the shared domain language in [`../../CONTEXT.md`](../../CONTEXT.md) when changing code, docs, tests, or agent handoffs.

## Review Contract

The review contract lives in [`src/review/types.ts`](../../src/review/types.ts), with boundary schemas in [`src/review/schemas.ts`](../../src/review/schemas.ts).

`ReviewRequest` contains:

- `target`: the target URI, content, content type, and optional byte length.
- `rules`: source-backed rules with `id`, `source`, `body`, optional `name`, optional `severity`, and optional Via Negativa violation conditions.
- `context`: optional caller-supplied review context.
- `budget`: explicit bounds for one review.
- `outputPolicy`: usage and payload telemetry policy.
- `modelCall`: `single`, `agent`, or `auto`.

Every executor implements:

```ts
interface ReviewExecutor {
  run(request: ReviewRequest): Promise<ReviewResult>;
}
```

`ReviewResult` contains:

- `findings`: verified findings anchored in target content.
- `scores`: per-rule scores.
- `diagnostics`: operational and finding-processing notes.
- `usage`: optional model-call and token metadata.
- `hadOperationalErrors`: optional flag for partial-result runs with operational errors.

The contract deliberately does not expose `evaluator`, `judge`, subjective rubric scoring, model-authored rule overrides, or autonomous workspace tools.

## Rule Model

VectorLint rules are objective Via Negativa checks. A rule should name observable violation conditions and ask the reviewer to find evidence that those conditions are present. The reviewer should not grade broad alignment against an ideal.

Good rules answer yes/no questions:

- Is this sentence using a banned phrase?
- Does this claim omit required evidence?
- Does this section repeat information already stated nearby?

Future-facing rule authors should avoid subjective judge/rubric designs. Historical rubric-style language remains only where it describes removed behavior.

## Model Calls

The model-call strategy is selected with `--model-call single|agent|auto`. The allowed values and default come from [`src/review/executor.ts`](../../src/review/executor.ts), [`src/cli/types.ts`](../../src/cli/types.ts), and [`src/schemas/cli-schemas.ts`](../../src/schemas/cli-schemas.ts).

### `single`

`single` uses [`SingleModelCallExecutor`](../../src/executors/single-model-call-executor.ts). It performs one structured model call per rule/chunk through `StructuredModelClient`. For targets above 600 words, it chunks line-numbered content and merges violations before shared finding processing.

The single executor owns no tool surface.

### `agent`

`agent` uses [`AgentModelCallExecutor`](../../src/executors/agent-model-call-executor.ts). It performs one bounded tool-calling run per rule through `ToolCallingModelClient`.

The only executor-owned tool is `read_target_section`, defined in [`src/executors/target-read-capability-adapter.ts`](../../src/executors/target-read-capability-adapter.ts). It reads 1-based line ranges from in-memory `request.target.content` and returns model-visible errors for invalid ranges.

The agent model call cannot:

- search the workspace;
- read arbitrary files;
- read URIs outside the target content;
- rewrite rules;
- create top-level workspace findings;
- override source-backed rule prompts.

### `auto`

`auto` resolves through `chooseModelCall` in [`src/review/executor.ts`](../../src/review/executor.ts). It selects `agent` when target content is larger than `AGENT_MODEL_CALL_BYTE_THRESHOLD` (`600_000` bytes) or when more than five rules apply. Otherwise, it selects `single`.

The CLI default is `auto`.

## On-Page Boundary

The on-page boundary is implemented in [`src/review/boundary.ts`](../../src/review/boundary.ts) and enforced by executor design.

Target content is always in scope. Caller-supplied review context is in scope only because the caller explicitly provided it. Workspace files are out of scope unless the caller passes their content as review context. Rule bodies are source-backed and loaded before the review request is built.

The target-read adapter performs no filesystem reads. It slices the target content already present in memory.

## Budgets

Default budgets live in [`src/review/budget.ts`](../../src/review/budget.ts):

| Field | Default | Meaning |
| --- | ---: | --- |
| `maxTargetBytes` | `1_000_000` | maximum target content size |
| `maxCallerContextBytes` | `500_000` | maximum caller-supplied context size |
| `maxChunksPerRule` | `20` | maximum chunks/tool steps per rule |
| `maxModelCallsPerReview` | `50` | maximum model calls in one review |
| `maxWallClockMs` | `300_000` | maximum elapsed review time, in milliseconds |

Budgets limit work, not output. There is intentionally no `maxFindingsPerRule`. There is also no headless retry budget because VectorLint no longer has a headless autonomous executor.

`maxWallClockMs` is the review timeout. Executors check model-call count and elapsed time before model calls and surface budget exhaustion as diagnostics when partial results can be returned.

## Finding Processing

Both model-call strategies use the same finding-processing pipeline in [`src/findings/`](../../src/findings/):

1. Filter candidate findings through the evidence gate.
2. Verify finding evidence against target content.
3. Deduplicate verified findings.
4. Score by verified finding count and density.
5. Resolve severity.
6. Assemble findings, scores, diagnostics, and operational status.

Unlocatable quoted evidence becomes a `finding-evidence-not-locatable` diagnostic and emits no finding. VectorLint does not fall back to model-provided line numbers for unverified evidence.

Diagnostics describe operational or finding-processing conditions such as unlocatable evidence, budget exhaustion, schema parse failures, and provider failures. They are not content findings.

## Provider And Model Capabilities

Providers are transport capabilities, not product owners.

[`StructuredModelClient`](../../src/providers/structured-model-client.ts) performs one structured model call and returns validated output.

[`ToolCallingModelClient`](../../src/providers/tool-calling-model-client.ts) performs one bounded tool-calling generation using caller-supplied tools and returns structured output. The provider does not define product tools. The executor supplies the tool map and run bounds.

Neither provider capability is an autonomous agent loop.

## Architecture Diagram

```text
CLI / External Caller
  |
  v
ReviewRequest
  - target
  - source-backed rules
  - caller-supplied context
  - budget
  - output policy
  - modelCall
  |
  v
chooseModelCall(auto?) ──> single ──> SingleModelCallExecutor
                      └─> agent  ──> AgentModelCallExecutor
                                         |
                                         v
                                  read_target_section
                                  target content only
  |
  v
Shared Finding Processing
  - filter
  - verify evidence
  - dedupe
  - score
  - diagnostics
  |
  v
ReviewResult
  |
  v
Formatters
  - line
  - json
  - vale-json
  - rdjson
```

## Internal Implementation Notes

`--model-call` is the documented CLI surface. The internal `--mode` flag is rejected at the CLI boundary so unreleased agent-mode wiring cannot be used accidentally.

The unreleased autonomous workspace implementation path is removed. External callers that need project-wide exploration should gather context before invoking VectorLint and pass selected content explicitly.

Subjective `judge`/rubric rules are not part of the future-facing architecture. New rules should be written as objective Via Negativa checks with observable violation conditions.

## References

- [`docs/audits/2026-07-10-vectorlint-harness-architecture-audit.md`](../audits/2026-07-10-vectorlint-harness-architecture-audit.md)
- [`src/review/types.ts`](../../src/review/types.ts)
- [`src/review/executor.ts`](../../src/review/executor.ts)
- [`src/review/budget.ts`](../../src/review/budget.ts)
- [`src/review/boundary.ts`](../../src/review/boundary.ts)
- [`src/executors/single-model-call-executor.ts`](../../src/executors/single-model-call-executor.ts)
- [`src/executors/agent-model-call-executor.ts`](../../src/executors/agent-model-call-executor.ts)
- [`src/executors/target-read-capability-adapter.ts`](../../src/executors/target-read-capability-adapter.ts)
- [`src/findings/processor.ts`](../../src/findings/processor.ts)
- [`src/providers/structured-model-client.ts`](../../src/providers/structured-model-client.ts)
- [`src/providers/tool-calling-model-client.ts`](../../src/providers/tool-calling-model-client.ts)
