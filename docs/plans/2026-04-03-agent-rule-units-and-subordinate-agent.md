# Agent Rule Units and Sub-Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic matched rule units, bundled multi-rule linting with per-rule context, provider-scoped capability-tier model selection, and a synchronous sub-agent `agent` tool without changing VectorLint's read-only review model.

**Architecture:** Keep the existing agent-mode review flow, but split the new behavior into small focused units. Add provider-scoped capability-tier config and a resolver first, then expand the tool contracts, then add matched rule-unit grouping and prompt rendering, then teach the existing `lint` tool path to execute one bundled review request, and finally add the restricted sub-agent `agent` tool on top of the same runtime foundation. For this first implementation, map runtime defaults as follows: the top-level agent loop resolves `high-capability`, bundled `lint` resolves `mid-capability`, and the sub-agent `agent` tool resolves the requested `model` tier or defaults to `high-capability` when omitted.

**Tech Stack:** TypeScript, Node.js, Vitest, Zod, Vercel AI SDK

---

### Task 1: Add Provider-Scoped Capability-Tier Config

**Files:**
- Create: `src/providers/model-capability.ts`
- Modify: `src/schemas/env-schemas.ts`
- Modify: `src/config/global-config.ts`
- Modify: `.env.example`
- Test: `tests/env-parser.test.ts`
- Test: `tests/provider-factory.test.ts`
- Test: `tests/global-config.test.ts`

**Step 1: Write the failing config tests**

Add focused tests that assert:

- OpenAI accepts `OPENAI_HIGH_CAPABILITY_MODEL`, `OPENAI_MID_CAPABILITY_MODEL`, `OPENAI_LOW_CAPABILITY_MODEL`
- Anthropic accepts `ANTHROPIC_HIGH_CAPABILITY_MODEL`, `ANTHROPIC_MID_CAPABILITY_MODEL`, `ANTHROPIC_LOW_CAPABILITY_MODEL`
- Gemini accepts `GEMINI_HIGH_CAPABILITY_MODEL`, `GEMINI_MID_CAPABILITY_MODEL`, `GEMINI_LOW_CAPABILITY_MODEL`
- Bedrock accepts `BEDROCK_HIGH_CAPABILITY_MODEL`, `BEDROCK_MID_CAPABILITY_MODEL`, `BEDROCK_LOW_CAPABILITY_MODEL`
- Azure accepts `AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME`, `AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME`, `AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME`
- Existing configs still parse when none of the new fields are present

Suggested test snippet for `tests/env-parser.test.ts`:

```ts
it('accepts provider-scoped capability-tier model fields for OpenAI', () => {
  const parsed = ENV_SCHEMA.parse({
    LLM_PROVIDER: ProviderType.OpenAI,
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-4o',
    OPENAI_HIGH_CAPABILITY_MODEL: 'gpt-5',
    OPENAI_MID_CAPABILITY_MODEL: 'gpt-4.1',
    OPENAI_LOW_CAPABILITY_MODEL: 'gpt-4.1-mini',
  });

  expect(parsed.OPENAI_HIGH_CAPABILITY_MODEL).toBe('gpt-5');
  expect(parsed.OPENAI_LOW_CAPABILITY_MODEL).toBe('gpt-4.1-mini');
});
```

**Step 2: Add the shared capability-tier helper**

Create `src/providers/model-capability.ts` with:

```ts
export const MODEL_CAPABILITY_TIERS = [
  'high-capability',
  'mid-capability',
  'low-capability',
] as const;

export type ModelCapabilityTier = (typeof MODEL_CAPABILITY_TIERS)[number];

export function resolveConfiguredModelForCapability(
  envConfig: EnvConfig,
  requested: ModelCapabilityTier
): string | undefined {
  // Return the provider-specific configured model/deployment name
  // using upward-only fallback within the active provider.
}
```

Implement the resolver so:

- `low-capability` falls back to mid, then high, then provider default
- `mid-capability` falls back to high, then provider default
- `high-capability` falls back to provider default
- fallback never routes to a weaker tier

For Azure, the helper should return deployment names, not raw model names.

**Step 3: Extend provider-specific env schemas**

In `src/schemas/env-schemas.ts`:

- add provider-scoped optional capability fields to each provider schema
- keep them optional
- do not change existing required fields

Example shape for OpenAI:

```ts
const OPENAI_CONFIG_SCHEMA = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default(OPENAI_DEFAULT_CONFIG.model),
  OPENAI_HIGH_CAPABILITY_MODEL: z.string().min(1).optional(),
  OPENAI_MID_CAPABILITY_MODEL: z.string().min(1).optional(),
  OPENAI_LOW_CAPABILITY_MODEL: z.string().min(1).optional(),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
});
```

For Azure, use deployment-name fields instead of `..._MODEL`.

**Step 4: Update templates**

Update `.env.example` and `src/config/global-config.ts` so each provider section shows the new capability-tier fields in the same provider-specific naming style.

**Step 5: Run focused tests**

Run: `npm run test:run -- tests/env-parser.test.ts tests/provider-factory.test.ts tests/global-config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/providers/model-capability.ts src/schemas/env-schemas.ts src/config/global-config.ts .env.example tests/env-parser.test.ts tests/provider-factory.test.ts tests/global-config.test.ts
git commit -m "feat(agent): add provider-scoped capability model config"
```

### Task 2: Add Capability-Aware Provider Wiring for Agent Mode

**Files:**
- Create: `src/providers/capability-provider-bundle.ts`
- Modify: `src/providers/provider-factory.ts`
- Modify: `src/providers/llm-provider.ts`
- Modify: `src/providers/vercel-ai-provider.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/orchestrator.ts`
- Modify: `src/agent/executor.ts`
- Test: `tests/provider-factory.test.ts`
- Test: `tests/providers/vercel-ai-provider-agent-loop.test.ts`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Write the failing provider-bundle tests**

Add tests that assert:

- the bundle resolves `high-capability`, `mid-capability`, and `low-capability` to the correct provider instances
- upward-only fallback works
- if no capability-tier fields are configured, agent mode still uses the current provider model
- the top-level agent loop resolves `high-capability`
- bundled `lint` resolves `mid-capability`

Suggested helper shape:

```ts
export interface CapabilityProviderBundle {
  defaultProvider: LLMProvider;
  resolveCapabilityProvider(requested: ModelCapabilityTier): LLMProvider;
  orchestratorProvider: LLMProvider;
  lintProvider: LLMProvider;
}
```

**Step 2: Build one provider bundle, not ad-hoc providers**

Create `src/providers/capability-provider-bundle.ts` that:

- accepts `EnvConfig` and existing `ProviderOptions`
- builds the current default provider
- builds any capability-tier providers configured for the active provider
- exposes a `resolveCapabilityProvider()` helper with upward-only fallback
- exposes `orchestratorProvider` and `lintProvider` defaults for agent mode

Do not duplicate provider-construction logic in multiple places. Reuse `createProvider()` or extract a small internal helper from `provider-factory.ts` if needed.

**Step 3: Teach the provider interface to return final agent text**

Extend `AgentToolLoopResult` in `src/providers/llm-provider.ts` to include:

```ts
export interface AgentToolLoopResult {
  usage?: TokenUsage;
  text?: string;
}
```

Update `src/providers/vercel-ai-provider.ts` to return `result.text` from `runAgentToolLoop()`. Keep existing usage behavior unchanged.

This is required so the sub-agent `agent` tool can return compact final output without inventing a second provider API.

**Step 4: Wire the bundle into the CLI and orchestrator**

Update `src/cli/commands.ts` and `src/cli/orchestrator.ts` so:

- standard mode keeps using the default provider path
- agent mode receives the capability-aware provider bundle
- `runAgentExecutor()` is passed:
  - `orchestratorProvider`
  - `lintProvider`
  - `resolveCapabilityProvider`

In `src/agent/executor.ts`, stop assuming one provider object handles all agent-mode responsibilities.

**Step 5: Run focused tests**

Run: `npm run test:run -- tests/provider-factory.test.ts tests/providers/vercel-ai-provider-agent-loop.test.ts tests/orchestrator-agent-output.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/providers/capability-provider-bundle.ts src/providers/provider-factory.ts src/providers/llm-provider.ts src/providers/vercel-ai-provider.ts src/cli/commands.ts src/cli/orchestrator.ts src/agent/executor.ts tests/provider-factory.test.ts tests/providers/vercel-ai-provider-agent-loop.test.ts tests/orchestrator-agent-output.test.ts
git commit -m "feat(agent): wire capability-aware providers"
```

### Task 3: Expand the Agent Tool Contracts

**Files:**
- Modify: `src/agent/types.ts`
- Modify: `src/agent/tools-registry.ts`
- Test: `tests/agent/types-contract.test.ts`

**Step 1: Write the failing schema tests**

Add tests that assert:

- `lint` accepts `file + rules[]`
- each rule member accepts `ruleSource`, optional `reviewInstruction`, optional `context`
- blank `reviewInstruction` and blank `context` fail after trimming
- the new `agent` tool contract accepts `task`, optional `label`, and optional `model`

Suggested contract snippet for `tests/agent/types-contract.test.ts`:

```ts
const lintInput = contracts.LINT_TOOL_INPUT_SCHEMA.parse({
  file: 'docs/guide.md',
  rules: [
    {
      ruleSource: 'packs/default/consistency.md',
      reviewInstruction: 'Review for consistency.',
      context: 'Evidence from another file.',
    },
  ],
});

expect(lintInput.rules).toHaveLength(1);
```

**Step 2: Replace the single-rule lint schema**

In `src/agent/types.ts`, add:

```ts
const NonBlankString = z.string().trim().min(1);

export const RULE_CALL_SCHEMA = z.object({
  ruleSource: NonBlankString,
  reviewInstruction: NonBlankString.optional(),
  context: NonBlankString.optional(),
});

export const LINT_TOOL_INPUT_SCHEMA = z.object({
  file: NonBlankString,
  rules: z.array(RULE_CALL_SCHEMA).min(1),
});

export const ModelCapabilityTierSchema = z.enum([
  'high-capability',
  'mid-capability',
  'low-capability',
]);

export const AGENT_TOOL_INPUT_SCHEMA = z.object({
  task: NonBlankString,
  label: NonBlankString.optional(),
  model: ModelCapabilityTierSchema.optional(),
});
```

**Step 3: Register the new `agent` tool**

In `src/agent/tools-registry.ts`:

- add `'agent'` to `AgentToolName`
- add the new input schema import
- register the `agent` tool with a description that clearly says it delegates bounded read-only work to a sub-agent
- update the `lint` description to explain that it accepts one file and explicit `rules[]`

**Step 4: Run focused tests**

Run: `npm run test:run -- tests/agent/types-contract.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/types.ts src/agent/tools-registry.ts tests/agent/types-contract.test.ts
git commit -m "feat(agent): expand lint and sub-agent tool contracts"
```

### Task 4: Build Deterministic Matched Rule Units

**Files:**
- Create: `src/utils/token-estimate.ts`
- Create: `src/agent/rule-units.ts`
- Modify: `src/boundaries/user-instruction-loader.ts`
- Modify: `src/agent/prompt-builder.ts`
- Modify: `src/agent/executor.ts`
- Test: `tests/agent/prompt-builder.test.ts`
- Test: `tests/agent/agent-executor.test.ts`
- Create: `tests/agent/rule-units.test.ts`

**Step 1: Write the failing rule-unit tests**

Add tests for:

- deterministic grouping for the same inputs and budget
- token-budget boundaries splitting groups
- prompt-builder heading becomes `Review files and Matched Rule Units`
- grouped member lists render explicitly per file

Suggested test shape for `tests/agent/rule-units.test.ts`:

```ts
it('groups matched rules deterministically under a token budget', () => {
  const units = buildMatchedRuleUnits(matches, promptBySource, 80);

  expect(units).toEqual([
    {
      file: 'README.md',
      rules: [
        { ruleSource: 'packs/default/ai-pattern.md' },
        { ruleSource: 'packs/default/consistency.md' },
      ],
    },
    {
      file: 'README.md',
      rules: [{ ruleSource: 'packs/default/unsupported-claims.md' }],
    },
  ]);
});
```

**Step 2: Extract token estimation into a shared utility**

Move the current `estimateTokens()` logic from `src/boundaries/user-instruction-loader.ts` into `src/utils/token-estimate.ts`:

```ts
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}
```

Update `user-instruction-loader.ts` to import the shared helper instead of keeping a private copy.

**Step 3: Create the rule-unit builder**

Create `src/agent/rule-units.ts` with:

```ts
export interface MatchedRuleUnit {
  file: string;
  rules: Array<{ ruleSource: string }>;
  estimatedTokens: number;
}

export function buildMatchedRuleUnits(
  fileRuleMatches: Array<{ file: string; ruleSource: string }>,
  promptBySource: Map<string, PromptFile>,
  tokenBudget: number
): MatchedRuleUnit[] {
  // Group by file, then greedily pack rules into units until the budget is hit.
}
```

Use the stored rule body length plus fixed wrapper overhead to estimate tokens conservatively. Do not invent synthetic IDs or files.

**Step 4: Update the prompt builder contract**

Change `src/agent/prompt-builder.ts` so it accepts `matchedRuleUnits` instead of flat `fileRuleMatches`, and render:

```txt
Review files and Matched Rule Units:
- README.md
  - Matched Rule Unit:
    - packs/default/ai-pattern.md
    - packs/default/consistency.md
```

Update `src/agent/executor.ts` to compute `matchedRuleUnits` before building the system prompt.

**Step 5: Run focused tests**

Run: `npm run test:run -- tests/agent/rule-units.test.ts tests/agent/prompt-builder.test.ts tests/agent/agent-executor.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/utils/token-estimate.ts src/agent/rule-units.ts src/boundaries/user-instruction-loader.ts src/agent/prompt-builder.ts src/agent/executor.ts tests/agent/rule-units.test.ts tests/agent/prompt-builder.test.ts tests/agent/agent-executor.test.ts
git commit -m "feat(agent): add deterministic matched rule units"
```

### Task 5: Teach `lint` to Run One Bundled Review Request

**Files:**
- Modify: `src/prompts/schema.ts`
- Modify: `src/agent/executor.ts`
- Test: `tests/agent/agent-executor.test.ts`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Write the failing bundled-lint tests**

Add tests that assert:

- one `lint({ file, rules: [...] })` call triggers one underlying structured review request
- the file is read once
- mixed-severity member rules preserve per-member severity in recorded findings
- mixed member arrays keep `reviewInstruction` and `context` isolated per member
- malformed grouped requests fail before the review request runs
- zero-finding bundled calls still succeed

**Step 2: Add a bundled structured-output schema**

In `src/prompts/schema.ts`, add:

```ts
export function buildBundledCheckLLMSchema() {
  return {
    name: 'vectorlint_bundled_check_result',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reasoning: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ruleSource: { type: 'string' },
              line: { type: 'number' },
              quoted_text: { type: 'string' },
              context_before: { type: 'string' },
              context_after: { type: 'string' },
              description: { type: 'string' },
              analysis: { type: 'string' },
              message: { type: 'string' },
              suggestion: { type: 'string' },
              fix: { type: 'string' },
              rule_quote: { type: 'string' },
              checks: { /* mirror existing check shape */ },
              check_notes: { /* mirror existing check-notes shape */ },
              confidence: { type: 'number' },
            },
            required: ['ruleSource', 'line', 'quoted_text', 'context_before', 'context_after', 'description', 'analysis', 'message', 'suggestion', 'fix', 'rule_quote', 'checks', 'check_notes', 'confidence'],
          },
        },
      },
      required: ['reasoning', 'findings'],
    },
  } as const;
}
```

The bundled schema must return `ruleSource` per finding so attribution does not depend on guesswork.

**Step 3: Rewrite `lintToolHandler()` for bundled requests**

In `src/agent/executor.ts`:

- parse `rules[]`
- resolve each member rule
- compute each member's effective body:
  - stored body by default
  - `reviewInstruction` replaces stored body
  - `context` appends under `Required context for this review:`
- build one bundled prompt body that clearly separates each member rule
- call `lintProvider.runPromptStructured()` once using the new bundled schema
- record findings by mapping returned `ruleSource` back to the member prompt
- return only `{ ok: true, findingsRecorded }`

Suggested bundled prompt layout:

```txt
Review the file against all of the following source-backed rules.
Keep findings attributed to the exact ruleSource that each issue belongs to.

Rule 1
ruleSource: packs/default/consistency.md
<effective body>

Rule 2
ruleSource: packs/default/unsupported-claims.md
<effective body>
```

Do not loop internally over `rules[]` and make one model request per member.

**Step 4: Run focused tests**

Run: `npm run test:run -- tests/agent/agent-executor.test.ts tests/orchestrator-agent-output.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/prompts/schema.ts src/agent/executor.ts tests/agent/agent-executor.test.ts tests/orchestrator-agent-output.test.ts
git commit -m "feat(agent): bundle multi-rule lint reviews"
```

### Task 6: Add the Restricted Sub-Agent `agent` Tool

**Files:**
- Create: `src/agent/sub-agent.ts`
- Modify: `src/agent/executor.ts`
- Modify: `src/agent/tools-registry.ts`
- Modify: `tests/agent/agent-executor.test.ts`
- Create: `tests/agent/sub-agent.test.ts`

**Step 1: Write the failing sub-agent tests**

Add tests that assert:

- the main agent can call `agent.execute({ task })`
- the sub-agent runs synchronously and returns compact final text only
- the sub-agent only receives `read_file`, `search_files`, `list_directory`, `search_content`
- attempts to call `lint` or `agent` inside the sub-agent run fail
- omitted `model` defaults to `high-capability`
- explicit `model: 'low-capability'` resolves upward-only fallback when low is not configured
- failure returns a compact error result without a full transcript

**Step 2: Create the sub-agent runtime helper**

Create `src/agent/sub-agent.ts` with one narrow entry point:

```ts
export async function runSubAgent(params: {
  provider: LLMProvider;
  task: string;
  workspaceRoot: string;
  label?: string;
  progressReporter?: AgentProgressReporter;
  tools: Record<'read_file' | 'search_files' | 'list_directory' | 'search_content', AgentToolDefinition>;
}): Promise<{ ok: true; result: string; usage?: TokenUsage } | { ok: false; error: string; usage?: TokenUsage }> {
  // Build a tight system prompt, run a restricted agent tool loop, and return final text only.
}
```

The sub-agent runtime should:

- build a focused sub-agent system prompt
- reuse the existing provider `runAgentToolLoop()` API
- only register the four read-only tools
- never expose `lint` or `agent`
- return `result.text` from the tool loop as compact final output

**Step 3: Wire the new tool into the main executor**

In `src/agent/executor.ts`:

- add `agentToolHandler()`
- resolve the sub-agent provider using `resolveCapabilityProvider(parsed.model ?? 'high-capability')`
- pass only the read-only tools into `runSubAgent()`
- return the sub-agent helper's compact result directly to the main agent

Do not let the sub-agent write to the review session store, record findings, or finalize the main review session.

**Step 4: Run focused tests**

Run: `npm run test:run -- tests/agent/sub-agent.test.ts tests/agent/agent-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/sub-agent.ts src/agent/executor.ts src/agent/tools-registry.ts tests/agent/sub-agent.test.ts tests/agent/agent-executor.test.ts
git commit -m "feat(agent): add restricted sub-agent tool"
```

### Task 7: Update User-Facing Config and Agent-Mode Documentation

**Files:**
- Modify: `README.md`
- Modify: `CONFIGURATION.md`
- Modify: `src/config/global-config.ts`
- Modify: `.env.example`
- Test: `tests/orchestrator-agent-output.test.ts`

**Step 1: Document the new capability-tier config**

Update `README.md` and `CONFIGURATION.md` with:

- provider-scoped capability-tier fields
- Azure deployment-name variant
- upward-only fallback behavior
- note that omitted sub-agent `model` defaults to `high-capability`

**Step 2: Document the new lint and agent tool behavior**

Update the agent-mode docs to explain:

- `lint` now accepts one file plus explicit `rules[]`
- `reviewInstruction` replaces a member rule body
- `context` appends under `Required context for this review:`
- matched rule units are precomputed by the runtime
- the sub-agent `agent` tool runs bounded read-only delegated work in isolated context

**Step 3: Run final verification**

Run:

```bash
npm run build
npm run lint
npm run test:run -- tests/agent tests/providers tests/orchestrator-agent-output.test.ts tests/provider-factory.test.ts tests/env-parser.test.ts tests/global-config.test.ts
```

Expected:

- `build`: PASS
- `lint`: PASS
- `test:run`: PASS

**Step 4: Commit**

```bash
git add README.md CONFIGURATION.md src/config/global-config.ts .env.example tests/orchestrator-agent-output.test.ts
git commit -m "docs(agent): document rule units and capability tiers"
```
