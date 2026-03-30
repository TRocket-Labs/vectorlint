# VectorLint Agentic Capabilities — Design Spec

**Date:** 2026-03-17 (rewritten 2026-03-30)  
**Status:** Approved  
**Scope:** VectorLint CLI agent mode execution model and runtime UX behavior

---

## Why This Revision

The previous runtime model used repeated isolated runs (`file + rule` units). That is deterministic but over-constrains behavior and does not reflect a true agent workflow.

This rewrite moves agent mode to a single long-lived agent session per CLI invocation, while preserving lint mode behavior and machine-safe output contracts.

---

## Goals

1. Run **one agent session per `--mode agent` invocation**.
2. Keep execution policy explicit: **file-first, rule-second, sequential**.
3. Preserve tool safety (read-only tools, root-bounded paths).
4. Allow incremental findings internally for live UX.
5. Add global `-p, --print` headless mode that suppresses interactive output without changing behavior.

---

## Non-Goals

- No write/edit/exec tools.
- No planner/sub-agent fanout.
- No change to lint scoring semantics.
- No schema change for JSON/RDJSON/Vale-JSON in this revision.

---

## Architecture Overview

```
GitHub App
    │
    ▼
VectorLint Cloud          ← receives webhook, sends credentials + PR metadata
    │
    ▼
VectorLint Service        ← shallow clones repo, invokes CLI
    │
    ▼
VectorLint CLI
    ├── Lint Executor     ← default mode: existing per-page evaluation
    └── Agent Executor    ← --mode agent: one agent session per run
         │
         └── Tools: lint, read_file, search_content, search_files, list_directory
```

The agent is a pure evaluator with read-only local filesystem access.

---

## Module Placement

| Component | Path |
|---|---|
| Agent Executor | `src/agent/agent-executor.ts` |
| Agent Finding types | `src/agent/types.ts` |
| Tool suite | `src/agent/tools/` |
| Report Merger | `src/agent/merger.ts` |
| Agent CLI orchestration | `src/cli/orchestrator.ts` |

---

## Components

### 1. Lint Executor

**Responsibility:** Run per-page VectorLint evaluation in lint mode.

**Behavior:** Existing lint behavior remains intact.

**Output:** Existing `PromptEvaluationResult` flow.

---

### 2. Agent Executor

**Mental model:** agent as planner/researcher, lint as structured prose evaluator.

- Agent gathers evidence and performs cross-file/structural checks.
- Lint evaluates on-page prose quality for specific rule criteria.

**Responsibility:** Run one LLM agent session for the entire invocation.

**Behavior:**

- Receives one run-level input from orchestrator:
  - requested review targets
  - file -> applicable rules mapping
  - optional user instructions
- Executes sequentially: file-first, then rule-second.
- Uses tools as needed and emits findings.
- Returns final consolidated findings for report generation.

**Run-level input shape:**

```ts
interface AgentRunInput {
  requestedTargets: string[];
  fileRuleMap: Array<{
    file: string;
    rules: PromptFile[];
  }>;
  userInstructions?: string;
  maxRetries?: number;
  maxParallelToolCalls?: number;
}
```

Naming contract:

- `requestedTargets` = files requested for this run (not git-changed files).
- Avoid names implying git diff semantics when data is not a diff/patch.

**Agent loop:**

Uses Vercel AI SDK tool loop (`generateText` + tool calls) with safety limits.

Stop conditions:

| Mechanism | Description | Default |
|---|---|---|
| Natural stop | Model ends with final response | — |
| `maxSteps` | Hard cap on iterative calls | 25 |
| `AbortSignal` | Wall-clock timeout | orchestrator-supplied |
| Structured output | Final response must satisfy schema | enabled |

---

## Prompt Precedence Contract (Critical)

System prompt sections are ordered strictly as:

1. **Role**
2. **Operating Policy** (highest-priority execution rules)
3. **Runtime Context**

### 1) Role

- "You are a senior technical writer and repository reviewer."

### 2) Operating Policy

- Process file-first, then rule-second, sequentially.
- For each file, apply only rules mapped to that file.
- Use `lint` for on-page writing checks.
- Use file tools for structural/cross-file checks.
- Emit findings only for genuine issues.

### 3) Runtime Context

- requested review targets
- file -> rules mapping
- rule definitions
- optional VECTORLINT.md instructions

This ordering ensures execution policy is not weakened by lower-priority context blocks.

---

## Tool Suite

All tools are read-only and root-bounded to repo `cwd`.

### `lint`

Purpose: structured prose evaluation for on-page checks.

```ts
{
  file: string;
  ruleContent: string;
  context?: string;
}
```

Guidance:

- Use lint for writing-quality issues.
- Use file tools for existence/link/structure checks.
- For mixed rules, agent may strip structural criteria before linting and validate structurals via file tools.

### `read_file`, `search_content`, `search_files`, `list_directory`

Purpose: gather repository evidence for cross-file and structural reasoning.

Constraints:

- no path traversal outside root
- no write operations
- outputs stay concise and chainable

---

## Incremental Findings and Final Reconciliation

Agent mode can emit findings incrementally during execution (for interactive UX).

Final report still uses canonical consolidated findings at run completion.

If both incremental and final outputs contain overlapping findings, dedupe during report merge using stable identity fields (`ruleId`, finding kind, location/message fingerprint).

---

## Global Headless Mode: `-p, --print`

Add global CLI flag:

```bash
vectorlint -p ...
vectorlint --print ...
```

Behavior:

- Applies to both lint and agent modes.
- Suppresses interactive runtime output:
  - no spinner/progress UI
  - no live tool-call status lines
  - no incremental finding prints
- Does **not** alter execution behavior:
  - same system prompt
  - same tools and tool decisions
  - same scoring/evaluation logic
- Final output still prints normally.

`--print` is a presentation switch, not a planning switch.

---

## Output Contract

### `line`

- Default: interactive progress + final summary.
- With `-p/--print`: final summary only.

### `json`, `rdjson`, `vale-json`

- Machine-safe stdout behavior remains unchanged.
- No interactive status noise on stdout.
- `--print` does not change payload schema.

---

## CLI Contract

```bash
vectorlint --mode agent <paths>
vectorlint --mode agent -p <paths>
```

- `--mode` absent => lint mode (default).
- `-p/--print` suppresses interactive output globally.

---

## GitHub Integration (Platform Layer)

CLI remains GitHub-agnostic.

Platform flow:

1. GitHub App receives PR webhook.
2. Cloud forwards metadata to Service.
3. Service clones repo and invokes CLI.
4. CLI runs one agent session per invocation.
5. Service consumes final report and posts annotations/comments.

---

## Migration Plan

1. Replace per-unit orchestration with single run-level executor invocation.
2. Build `fileRuleMap` once from existing scan-path/rule matching semantics.
3. Update prompt builder to strict precedence order (Role -> Policy -> Context).
4. Add global `-p/--print` flag and propagate to lint + agent reporters.
5. Keep scoring/output rendering logic unchanged except ingestion source.

---

## Test Plan

### Unit / Integration

1. Orchestrator calls agent executor once per run.
2. Executor receives full `fileRuleMap` and requested targets.
3. Prompt section order is enforced.
4. `-p` suppresses runtime progress in lint and agent modes.
5. JSON-family payload behavior remains unchanged.

### Runtime E2E

1. Single-file on-page rule review in agent mode.
2. Multi-file top-level review in agent mode.
3. Repeat both with `-p` and verify final-only output.

---

## Rollout Notes

- This is a runtime architecture refinement, not a rules engine replacement.
- Existing rule packs and config matching semantics remain valid.
- UX now reflects one agent working through the run, instead of many isolated micro-runs.
