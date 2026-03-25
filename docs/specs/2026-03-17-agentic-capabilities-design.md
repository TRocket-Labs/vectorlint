# VectorLint Agentic Capabilities — Design Spec

**Date:** 2026-03-17
**Status:** Draft
**Scope:** VectorLint CLI — agent mode, agent executor, and read-only tool suite

---

## Problem

VectorLint today evaluates documentation page by page. Each file is audited in isolation against rules. This works well for per-page quality but cannot see cross-document problems:

- Information architecture gaps — broken internal links, orphaned pages
- Coverage gaps — features exist in code but have no documentation page
- Code-to-doc drift — function signatures change but docs still show old parameters
- Corpus-level completeness — missing `llms.txt`, changelog, migration guide

These problems require reasoning across multiple files simultaneously, which per-page linting cannot do regardless of rule quality.

---

## Goals

1. Add an **agent mode** to the VectorLint CLI that can perform cross-document evaluation
2. Preserve per-page lint mode as the foundation — agent mode delegates to it via a tool, not replaces it
3. Minimize user configuration — no rule classification step, no per-rule routing
4. All findings (lint and agent) include file + line references so users can verify without hunting
5. Agent mode works locally (CLI) and in CI (via VectorLint Service + shallow clone)

---

## Non-Goals

- Vale integration (opt-in only, user-configured, no translation layer)
- Write access to any files
- Git history access
- Interactive/conversational agent (single-run, report output only)
- Full audit mode (out of scope for v1 — start with PR diff scope)
- `query_codebase` sub-agent tool (deferred to v2 — needed for deep code comprehension; file tools cover v1 cases)

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
    ├── Lint Executor     ← default mode: existing per-page evaluation (unchanged)
    └── Agent Executor    ← --mode agent: one agent per rule, parallel
         │
         └── Tools: lint, read_file, search_content, search_files, list_directory
```

The agent is a pure evaluator — it has no knowledge of GitHub, PRs, or webhooks. It operates entirely against the local filesystem (shallow clone root).

---

## Module Placement

New components map to existing `src/` structure as follows:

| Component | Path |
|---|---|
| Agent Executor | `src/agent/agent-executor.ts` |
| Agent Finding types | `src/agent/types.ts` |
| Tool suite | `src/agent/tools/` (one file per tool) |
| Report Merger | `src/agent/merger.ts` |
| Agent CLI orchestration | extend `src/cli/orchestrator.ts` |

---

## Components

### 1. Lint Executor

**Responsibility:** Run per-page VectorLint evaluation for all rules in default mode.

**Behavior:** Identical to current VectorLint behavior. No changes to the core linter. Runs in parallel across files.

**Output:** `PromptEvaluationResult` per file (existing type from `src/prompts/schema.ts`).

---

### 2. Agent Executor

**Responsibility:** Run an LLM agent for each rule when in agent mode. The agent acts as a senior technical writer with a tool belt — it calls the `lint` tool for per-page evaluation and uses file tools to gather cross-file evidence.

**Behavior:**
- Receives all loaded rules from the orchestrator directly (one agent invocation per rule)
- **v1 default:** One agent invocation per rule. Batching deferred to v2.
- Agent's starting context: the PR diff — provided as part of the agent's initial instructions. The Service constructs this context (changed files + diff) and passes it when invoking the CLI. No CLI parameter required.
- Agent uses tools to expand context on demand — does not ingest the full repo upfront
- Structured output enforced by Vercel AI SDK against `AgentFindingSchema` (see Report Merger)

**Scope (v1):** PR diff scope. Agent starts from changed files and searches outward only via explicit tool calls.

**Agent loop:**

The agent executor uses `generateText` from the Vercel AI SDK with `maxSteps`. The SDK manages the tool-use loop natively — no manual while-loop required:

1. LLM call → response with optional tool calls
2. Execute tool calls locally, append results to conversation history
3. Feed full history back to LLM
4. Repeat until natural stop or a limit is reached

**Stop conditions (all active simultaneously):**

| Mechanism | Description | Default |
|---|---|---|
| Natural stop | LLM produces a response with no tool calls — primary exit | — |
| `maxSteps` | Hard cap on LLM call iterations — safety net for runaway loops | 25 |
| `AbortSignal` | Wall-clock timeout; propagates to all tools and LLM calls | Set by orchestrator |
| Structured output | `AgentFindingSchema` forces a final valid response shape | — |

Each step = one LLM call + all tool calls it requests in that response. At the `maxSteps` cap, the SDK forces a final text response. The structured output requirement acts as a natural forcing function — the agent knows its task is complete when it has produced a schema-valid findings report.

**System prompt structure:**

The agent system prompt is constructed separately from the lint system prompt — the two modes work differently and require different instructions. Sections are joined with double newlines:

1. Role declaration — "senior technical writer" framing
2. Rule body — the rule's name, id, and full criteria text
3. Tool descriptions — explicit one-line description of each tool (supplements the SDK schema)
4. Usage guidelines — when to use each tool, search strategy, when to stop
5. User instructions — VECTORLINT.md content, if present (same file lint uses)
6. PR context — changed files and diff summary (absent in local runs)
7. Output instructions — findings schema, stopping condition, "only genuine problems"
8. Date + repo root — for recency-aware rules and correct file path construction

**VECTORLINT.md injection:**

If `VECTORLINT.md` exists in the repo root, its contents are injected into the agent system prompt as a "User Instructions" section. This is the same file the lint executor already uses for global style context. The agent and lint executors each use it independently via their own system prompts.

**Model selection:**

Uses whatever `LanguageModel` (Vercel AI SDK) is derived from the user's configured LLM provider. No hardcoded model. A standard model (e.g. `claude-sonnet-4-6`) is sufficient for doc audits — the agentic loop itself provides iterative reasoning through tool-use cycles. Extended thinking models are supported but add latency and cost without proportional benefit for search-and-evidence tasks.

---

### 3. Tool Suite

All tools are scoped to `cwd` (the shallow clone root). Paths are resolved relative to
`cwd`. No path traversal outside `cwd` is permitted. No write tools.

In v1, cancellation is wired to the model call (`generateText`) via `AbortSignal`.
Tool implementations do not currently accept a `signal` parameter; they are expected
to be short-lived, local operations (filesystem reads/search) and still obey the same
root-boundary and read-only constraints. Full per-tool signal propagation can be added
in a future hardening pass if long-running tool operations are introduced.

#### `lint` — primary per-page evaluation

```ts
// Parameters
{ file: string; ruleId: string }
// ruleId: the PromptFile.id value (e.g. "AiPattern", "Repetition")

// Runs the full VectorLint evaluation for a single file + rule.
// Returns a lean summary — NOT raw file content:
interface LintToolResult {
  score: number;            // 1-10
  violationCount: number;
  violations: Array<{
    line: number;
    message: string;        // human-readable description
  }>;
}
// The agent calls this for per-page evaluation. Cross-file evidence (file existence,
// code-doc alignment, structural checks) is gathered with the file tools below.
```

#### `read_file`

```ts
// Parameters
{ path: string; offset?: number; limit?: number }

// Returns: text content, truncated at byte limit with actionable notice
// [Showing lines X-Y of Z. Use offset=N to continue.]
// Covers both documentation and source code files. No image support.
```

#### `search_content`

```ts
// Parameters
{ pattern: string; path?: string; glob?: string; ignoreCase?: boolean; context?: number; limit?: number }

// Internally: runs ripgrep with --json for structured parsing
// Output returned to agent: file:line: matchedtext (formatted from parsed JSON)
// Respects .gitignore. Default glob: **/*.md
// Stops at match limit with notice: [100 matches limit reached. Use limit=200 for more]
```

Note: ripgrep `--json` is used internally for reliable parsing; results are formatted as `file:line: text` before being returned to the agent. These are not contradictory — JSON is an implementation detail.

#### `search_files`

```ts
// Parameters
{ pattern: string; path?: string; limit?: number }

// Uses globSync (glob package). No fd binary required.
// Respects .gitignore. Returns paths relative to repo root for direct chaining into read_file/lint.
```

Rationale: `search_files` output is consumed by other tools in the same agent loop. Returning repo-root-relative paths avoids hidden state (remembering the `path` prefix from a prior call) and reduces file-not-found errors during tool chaining.

#### `list_directory`

```ts
// Parameters
{ path?: string; limit?: number }

// readdirSync, sorted alphabetically, / suffix for directories, includes dotfiles.
```

**v2 addition — `query_codebase`:** A sub-agent tool that accepts a natural-language question about the codebase and returns a plain-English answer. The main agent's context stays lean — it sees the answer, not raw code. Deferred to v2 pending real use cases where `read_file` alone is insufficient for understanding code.

---

### 4. Report Merger

Renders output from the agent executor. In agent mode, all findings come from agents — the `lint` tool is called internally by agents, but its results are incorporated into agent findings and are not reported separately.

**Agent finding schema** (Zod — used by Vercel AI SDK to enforce structured output from agent):

Two finding types. `inline` has exact locations. `top-level` has optional references — covers both cross-doc findings (references with lines) and structural findings (references without lines, or no references at all).

```ts
// src/agent/types.ts

// Exact in-page finding
const InlineFindingSchema = z.object({
  kind: z.literal("inline"),
  file: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

// Cross-doc or structural finding
const TopLevelFindingSchema = z.object({
  kind: z.literal("top-level"),
  references: z.array(z.object({
    file: z.string(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
  })).optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string(),
});

const AgentFindingSchema = z.discriminatedUnion("kind", [
  InlineFindingSchema,
  TopLevelFindingSchema,
]);

export type AgentFinding = z.infer<typeof AgentFindingSchema>;
```

**Output format handling:**
- `line` output: `inline` agent findings render with file + line reference; `top-level` findings render as a summary block with any available references listed beneath
- `json` output: agent findings use `AgentFinding` shape
- `rdjson` output: agent findings are mapped to RDJSON diagnostics for downstream annotation tooling (for example GitHub inline comments)
- `vale-json` output: unsupported in agent mode; CLI logs a warning and falls back to JSON output

---

## CLI Contract

```bash
vectorlint --mode agent <paths>
```

When `--mode agent` is absent, VectorLint runs in existing lint-only mode. No behavioral change for current users.

The diff is not a CLI parameter. The Service constructs the agent's starting context — which files changed and what changed in each — and passes it as part of the agent's instructions. VectorLint CLI just needs a path to work against.

---

## GitHub Integration (Platform Layer — Outside CLI)

The CLI knows nothing about GitHub. Integration lives entirely in the platform:

1. GitHub App receives PR webhook
2. VectorLint Cloud forwards to VectorLint Service with: installation token, repo info, PR metadata
3. VectorLint Service calls GitHub API to fetch changed files + diffs
4. Service runs `git clone --depth 1 <repo>` using the token
5. Service constructs agent instructions (changed files + diff context) and invokes: `vectorlint --mode agent <docs-path>`
6. CLI runs agent executor (one per rule, parallel) → outputs report (JSON)
7. Service returns report to Cloud → Cloud posts PR review comments

**GitHub App permission required:** Contents: read

**Future path:** Skip the clone step by implementing a GitHub-backed `ReadFileOperations` that calls the Contents API. The agent sees no difference — same tool interface, different I/O backend.

---

## Scope Ladder (Incremental)

| Phase | Scope | Description |
|---|---|---|
| v1 | PR diff | Agent starts from changed files, searches outward only via explicit tool calls |
| v2 | Impact-aware | Agent reasons about what the change might affect and searches for those patterns |
| v3 | Full audit | Scheduled run — agent scans everything, not triggered by a PR |

---

## Tool Implementation Reference

Patterns sourced from `pi-mono/packages/coding-agent/src/core/tools/`.

**Factory function pattern — scope all tools to `cwd`:**
```ts
const tools = {
  readFile: createReadFileTool(cloneRoot),
  searchContent: createSearchContentTool(cloneRoot),
  searchFiles: createSearchFilesTool(cloneRoot),
  listDirectory: createListDirectoryTool(cloneRoot),
  lint: createLintTool(cloneRoot, lintRunner),
};
```

**Truncation with actionable notices:** Output is capped at a byte limit. The notice always tells the agent what to do next (use `offset=N`, use `limit=N*2`, etc.).

**AbortSignal pattern:** All tools follow the three-pattern approach documented in the Tool Suite section above. Sourced from `pi-mono/packages/coding-agent/src/core/tools/read.ts`.

**What to skip from pi-mono:**
- Image reading/resizing in `read_file`
- `fd` binary download — `globSync` is sufficient for docs
- macOS screenshot path normalizations — keep only `resolveToCwd`
- Write, edit, bash tools

**Pluggable operations interface** (defer to v2 — useful for GitHub API backend):
```ts
interface ReadFileOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  access: (absolutePath: string) => Promise<void>;
}
```
