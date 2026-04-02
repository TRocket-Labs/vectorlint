# Agent Mode UX & Reliability Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix agent-mode progress UX, rule visibility, retry wiring, and missing-finalize output behavior while introducing a dedicated prompt builder.

**Architecture:** Keep agent behavior test-driven through public entry points (`evaluateFiles`, `runAgentExecutor`, provider contract). Extract system prompt composition into a dedicated module, add explicit agent status updates for richer progress rendering, and wire retry configuration from CLI/options to provider loop defaults. Preserve event-sourced behavior while allowing surfaced findings to remain visible even when finalization fails.

**Tech Stack:** TypeScript, Vitest, Node.js, Vercel AI SDK, existing VectorLint CLI/orchestrator architecture.

---

### Task 1: Add Dedicated Agent Prompt Builder (TDD tracer bullet)

**Files:**
- Create: `src/agent/prompt-builder.ts`
- Test: `tests/agent/prompt-builder.test.ts`
- Modify: `src/agent/executor.ts`

**Step 1: Run the failing prompt-builder tests**

Run: `npm run test:run -- tests/agent/prompt-builder.test.ts`  
Expected: FAIL (`../../src/agent/prompt-builder` missing).

**Step 2: Write minimal prompt-builder implementation**

```ts
export interface BuildAgentSystemPromptParams {
  repositoryRoot: string;
  targets: string[];
  availableRuleSources: string[];
  userInstructions?: string;
}

export function buildAgentSystemPrompt(params: BuildAgentSystemPromptParams): string {
  // build one deterministic prompt string with contract sections
}
```

**Step 3: Use builder inside executor**

```ts
const systemPrompt = buildAgentSystemPrompt({
  repositoryRoot,
  targets: relativeTargets,
  availableRuleSources: validSources,
  ...(userInstructions ? { userInstructions } : {}),
});
```

**Step 4: Re-run prompt-builder tests**

Run: `npm run test:run -- tests/agent/prompt-builder.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/agent/prompt-builder.ts src/agent/executor.ts tests/agent/prompt-builder.test.ts
git commit -m "refactor(agent): add dedicated system prompt builder"
```

---

### Task 2: Upgrade Agent Progress Reporter to In-Place Updates

**Files:**
- Modify: `src/agent/progress.ts`
- Modify: `src/agent/executor.ts`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Run first failing UX test**

Run: `npm run test:run -- tests/orchestrator-agent-output.test.ts -t "uses in-place progress updates for repeated tool calls"`  
Expected: FAIL (no `\x1b[1A` / appending plain lines).

**Step 2: Add in-place active block rendering API**

```ts
class AgentProgressReporter {
  startRun(): void;
  startFile(file: string, rule: string): void;
  updateRule(rule: string): void;
  updateTool(toolName: string, toolArgs?: unknown, rulePreview?: string): void;
  finishFile(): void;
  finishRun(): void;
}
```

**Step 3: Wire executor to send richer updates**

```ts
progressReporter?.updateRule(prompt.meta.name ?? prompt.meta.id ?? "Rule");
progressReporter?.updateTool(toolName, input, prompt.body);
```

**Step 4: Re-run first UX test**

Run: `npm run test:run -- tests/orchestrator-agent-output.test.ts -t "uses in-place progress updates for repeated tool calls"`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/agent/progress.ts src/agent/executor.ts tests/orchestrator-agent-output.test.ts
git commit -m "feat(agent): render in-place progress updates for tool activity"
```

---

### Task 3: Fix Rule Label Progress Updates Across Multiple Lint Calls

**Files:**
- Modify: `src/agent/executor.ts`
- Modify: `src/agent/progress.ts`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Run rule-label failing test**

Run: `npm run test:run -- tests/orchestrator-agent-output.test.ts -t "updates progress rule labels as the active lint rule changes"`  
Expected: FAIL (stuck on first rule label).

**Step 2: Ensure lint calls update active rule label before tool call render**

```ts
if (toolName === "lint") {
  progressReporter?.updateRule(activeRuleName);
}
progressReporter?.updateTool(toolName, input, rulePreview);
```

**Step 3: Re-run rule-label test**

Run: `npm run test:run -- tests/orchestrator-agent-output.test.ts -t "updates progress rule labels as the active lint rule changes"`  
Expected: PASS.

**Step 4: Commit**

```bash
git add src/agent/executor.ts src/agent/progress.ts tests/orchestrator-agent-output.test.ts
git commit -m "feat(agent): reflect active rule in progress header updates"
```

---

### Task 4: Preserve Findings on Missing Finalize While Marking Operational Failure

**Files:**
- Modify: `src/agent/executor.ts`
- Test: `tests/agent/agent-executor.test.ts`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Run missing-finalize failing tests**

Run:  
`npm run test:run -- tests/agent/agent-executor.test.ts -t "preserves findings when finalize_review is missing"`  
`npm run test:run -- tests/orchestrator-agent-output.test.ts -t "surfaces findings recorded before missing finalize"`  
Expected: FAIL (findings dropped when no `session_finalized`).

**Step 2: Keep replayed findings even when finalize is absent**

```ts
const findings = findingsFromEvents(events);
if (!hasFinalizedEvent) {
  hadOperationalErrors = true;
  errorMessage = errorMessage ?? "Agent run ended without finalize_review.";
}
```

**Step 3: Re-run missing-finalize tests**

Run: same commands as Step 1  
Expected: PASS.

**Step 4: Commit**

```bash
git add src/agent/executor.ts tests/agent/agent-executor.test.ts tests/orchestrator-agent-output.test.ts
git commit -m "feat(agent): keep surfaced findings when finalize step is missing"
```

---

### Task 5: Wire Agent Retry Budget (Default + Configured)

**Files:**
- Modify: `src/cli/types.ts`
- Modify: `src/schemas/cli-schemas.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/orchestrator.ts`
- Modify: `src/agent/executor.ts`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Run retry-wiring failing tests**

Run:  
`npm run test:run -- tests/orchestrator-agent-output.test.ts -t "passes a default agent retry budget"`  
`npm run test:run -- tests/orchestrator-agent-output.test.ts -t "passes configured agent retry budget"`  
Expected: FAIL (`maxRetries` undefined).

**Step 2: Add agent retry option to CLI/options surface**

```ts
interface EvaluationOptions {
  agentMaxRetries?: number;
}
```

```ts
.option("--agent-max-retries <n>", "Agent retry budget", parseInt)
```

**Step 3: Apply default retry policy and pass through**

```ts
const agentMaxRetries = options.agentMaxRetries ?? 10;
runAgentExecutor({ ..., maxRetries: agentMaxRetries });
```

**Step 4: Re-run retry tests**

Run: same commands as Step 1  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli/types.ts src/schemas/cli-schemas.ts src/cli/commands.ts src/cli/orchestrator.ts src/agent/executor.ts tests/orchestrator-agent-output.test.ts
git commit -m "feat(agent): wire default and configured retry budgets"
```

---

### Task 6: Full Validation and Documentation Sync

**Files:**
- Modify: `README.md`
- Verify: `tests/agent/prompt-builder.test.ts`
- Verify: `tests/agent/agent-executor.test.ts`
- Verify: `tests/orchestrator-agent-output.test.ts`

**Step 1: Run focused suites**

Run:  
`npm run test:run -- tests/agent/prompt-builder.test.ts tests/agent/agent-executor.test.ts tests/orchestrator-agent-output.test.ts`
Expected: PASS.

**Step 2: Run quality checks**

Run:
- `npm run lint`
- `npm run test:run`
- `npm run build`

Expected: PASS.

**Step 3: Update README agent-mode behavior notes**

Document:
- in-place progress updates in line mode
- retries (`--agent-max-retries`)
- missing-finalize behavior (operational failure + surfaced findings)
- dedicated prompt builder contract

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs(agent): document progress, retry, and finalize behavior"
```

---

## Constraints

- Keep changes focused on requested behavior only (no opportunistic refactors).
- Preserve read-only tool boundaries.
- Keep agent concurrency serial by default.
- Maintain event-sourced reporting.

## Done Criteria

1. Progress UX reflects active rule/tool with in-place updates.
2. Agent system prompt is built via dedicated builder module.
3. Retry budget is wired end-to-end with sensible default and override.
4. Missing-finalize runs still surface recorded findings while failing operationally.
5. All new/red tests pass, plus lint/full test/build.
