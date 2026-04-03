# Agent Rule Units and Exploration Agent Design

**Date:** 2026-04-02  
**Status:** Approved  
**Scope:** Agent-mode lint contract expansion, deterministic matched rule-unit construction, and sub-agent tooling

## 1) Goal

Reduce repeated review cost in agent mode without lowering review quality by:

- allowing one `lint` tool call to review a file against multiple matched rules in one underlying review request
- restoring optional per-rule supplemental context for rule runs
- deterministically grouping matched rules into prompt-time rule units
- adding a sub-agent `agent` tool for bounded, read-only exploration work
- introducing provider-scoped capability-tier model configuration so different review tasks can use different configured model tiers with explicit fallback behavior

This design does not introduce writing, rewriting, or editing behavior. VectorLint remains a read-only review system.

## 2) Approved Decisions

- Keep the tool name `lint`.
- Replace the current single-rule lint input with `file + rules[]`.
- Each rule item supports `ruleSource`, optional `reviewInstruction`, and optional `context`.
- `reviewInstruction` and `context` serve different purposes and may both be present on the same rule item.
- `reviewInstruction` replaces the stored rule body for that rule item.
- `context` appends to the effective rule body under the exact label `Required context for this review:`.
- If both are present, the effective body is `reviewInstruction` plus appended `context`.
- One bundled `lint` call means one underlying review request, not one wrapper call around multiple hidden review requests.
- Rule grouping is deterministic and prompt-time only. No bundled rule files are created.
- The agent does not decide how to group rules. The runtime constructs matched rule units before the agent run starts.
- The agent receives the full member list for each matched rule unit in its system prompt.
- The agent calls `lint` with the explicit `rules[]` array. No rule-unit IDs are introduced.
- Findings keep original per-rule `ruleSource` and severity. Severity is not lifted to the bundle level.
- Add a sub-agent tool named `agent` for bounded exploration.
- The sub-agent `agent` is synchronous, read-only, and cannot call `lint` or recursively call `agent`.
- Add optional provider-scoped capability-tier model configuration for the active provider.
- Keep the current direct configured provider model or deployment setting as the legacy/default fallback value for that provider.
- The sub-agent `agent` tool accepts an optional `model` parameter whose values are capability tiers, not raw provider model IDs.
- When the sub-agent `agent` tool omits `model`, it defaults to `high-capability`.
- Capability-tier fallback always moves upward to a stronger configured capability tier before falling back to the legacy/default configured model.
- Capability-tier fallback never moves downward to a weaker configured tier.

## 3) Lint Tool Contract

Approved lint input shape:

```ts
const NonBlankString = z.string().trim().min(1);

const RULE_CALL_SCHEMA = z.object({
  ruleSource: NonBlankString,
  reviewInstruction: NonBlankString.optional(),
  context: NonBlankString.optional(),
});

const LINT_TOOL_INPUT_SCHEMA = z.object({
  file: NonBlankString,
  rules: z.array(RULE_CALL_SCHEMA).min(1),
});
```

Behavior per rule item:

1. Resolve the stored rule by `ruleSource`.
2. Determine the effective base body:
   - use the stored rule body by default
   - if `reviewInstruction` is present, replace the stored body with it
3. If `context` is present, append:

```txt
Required context for this review:
<context>
```

4. Keep original rule identity and severity anchored to the resolved source rule.

The `lint` tool result remains minimal and non-decision-driving for the main agent. It should only acknowledge execution success and aggregate finding count:

```ts
{
  ok: true,
  findingsRecorded: number,
}
```

Detailed findings remain authoritative in the session store and final report output, not in the tool response returned to the main agent.

## 4) Effective Prompt Assembly

Bundled linting changes prompt assembly inside the existing `lint` tool path. It does not create a second review execution path.

The `lint` tool should:

1. Read the target file once.
2. Resolve all requested rule items.
3. Build one combined prompt body for the full `rules[]` set.
4. Send one underlying review request for that file plus that combined bundled prompt.
5. Parse and record findings with original member-rule attribution.

This means:

- one agent `lint` tool call
- one file read
- one underlying review request

and not:

- one agent `lint` tool call
- N hidden review requests, one per rule item

Pseudo-code:

```ts
async function lintToolHandler(input: LintToolInput): Promise<LintToolResult> {
  const parsed = LINT_TOOL_INPUT_SCHEMA.parse(input);
  const content = await readFile(resolveWithinRoot(workspaceRoot, parsed.file), "utf8");

  const resolvedMembers = parsed.rules.map((ruleItem) => {
    const prompt = resolvePromptBySource(ruleItem.ruleSource, promptBySource);
    if (!prompt) throw buildUnknownRuleSourceError(ruleItem.ruleSource, validSources);

    const baseBody = ruleItem.reviewInstruction ?? prompt.body;
    const effectiveBody = ruleItem.context
      ? `${baseBody}\n\nRequired context for this review:\n${ruleItem.context}`
      : baseBody;

    return {
      prompt,
      ruleSource: normalizeRuleSource(ruleItem.ruleSource),
      severity: severityFromPrompt(prompt),
      effectiveBody,
    };
  });

  const bundledPromptBody = buildBundledPromptBody(resolvedMembers);
  const result = await runBundledLintReview(parsed.file, content, bundledPromptBody);
  const findingsRecorded = await recordBundledFindings(result, resolvedMembers, parsed.file, content, store);

  return { ok: true, findingsRecorded };
}
```

The pseudo-code above defines the required behavior even if final helper names differ:

- the existing `lint` tool remains the only review execution path
- prompt assembly becomes multi-rule aware
- attribution remains per original rule

## 5) Capability-Tier Model Configuration

Capability-tier model configuration is provider-scoped and should follow the naming conventions already used by the active provider in this repository.

For model-name-based providers, add three optional fields:

- `<PROVIDER>_HIGH_CAPABILITY_MODEL`
- `<PROVIDER>_MID_CAPABILITY_MODEL`
- `<PROVIDER>_LOW_CAPABILITY_MODEL`

Concrete examples:

- `OPENAI_HIGH_CAPABILITY_MODEL`
- `OPENAI_MID_CAPABILITY_MODEL`
- `OPENAI_LOW_CAPABILITY_MODEL`
- `ANTHROPIC_HIGH_CAPABILITY_MODEL`
- `ANTHROPIC_MID_CAPABILITY_MODEL`
- `ANTHROPIC_LOW_CAPABILITY_MODEL`
- `GEMINI_HIGH_CAPABILITY_MODEL`
- `GEMINI_MID_CAPABILITY_MODEL`
- `GEMINI_LOW_CAPABILITY_MODEL`
- `BEDROCK_HIGH_CAPABILITY_MODEL`
- `BEDROCK_MID_CAPABILITY_MODEL`
- `BEDROCK_LOW_CAPABILITY_MODEL`

Azure currently uses deployment names rather than raw model names, so it should follow the provider’s existing deployment naming style:

- `AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME`
- `AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME`
- `AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME`

Keep the current direct configured provider model or deployment setting as the legacy/default fallback value for that same provider so existing setups continue to work unchanged.

These capability-tier fields describe relative model capability, not VectorLint-specific use cases. Runtime paths may use them differently over time without requiring the field names to change.

Approved fallback behavior:

1. If the requested capability-tier model is configured, use it.
2. Otherwise, fall back upward to the next stronger configured capability-tier model.
3. If no suitable capability-tier model is configured, fall back to the current direct configured provider model or deployment setting for the active provider.
4. Fallback never moves downward to a weaker capability tier.

Examples:

- request `low-capability`:
  - use `LowCapabilityModel` if set
  - else use `MidCapabilityModel` if set
  - else use `HighCapabilityModel` if set
  - else use the legacy/default configured provider model or deployment setting

- request `mid-capability`:
  - use `MidCapabilityModel` if set
  - else use `HighCapabilityModel` if set
  - else use the legacy/default configured provider model or deployment setting

- request `high-capability`:
  - use `HighCapabilityModel` if set
  - else use the legacy/default configured provider model or deployment setting

If none of the new capability-tier fields are configured, all runtime paths keep using the current direct configured provider model or deployment setting for the selected provider.

## 6) Matched Rule Units

Matched rule units are a prompt-time planning structure, not a persisted artifact.

Purpose:

The current review flow is inefficient because matched rules are effectively sent again with their surrounding prompt scaffolding on every single review call. That repeats shared instruction overhead and file context more often than necessary. Matched rule units make the current design more efficient by bundling compatible matched rules into one review request while preserving original rule attribution and severity.

- pre-group matched rules deterministically before the agent run starts
- reduce repeated document + shared prompt overhead
- give the agent explicit grouped rule arrays to call through the `lint` tool

Matched rule units do not:

- create bundled rule files
- create stored JSON bundle state
- introduce synthetic IDs that the agent must reference

The runtime constructs matched rule units using a configured token budget. In practice:

- load matched source rules as usual
- estimate how many rule tokens can fit in one bundled review request
- group matched rules into explicit arrays that fit under that budget
- inject those arrays into the agent system prompt

The token budget is the determinant. The agent does not invent new groupings at runtime.

## 7) Agent System Prompt Changes

The system prompt section currently called `Review files and matched rules` should become:

`Review files and Matched Rule Units`

Current shape is a structured per-file bullet list of matched rules. The new shape remains structured and explicit, but grouped by matched rule unit.

Conceptual prompt shape:

```txt
Review files and Matched Rule Units:
- README.md
  - Matched Rule Unit:
    - packs/default/ai-pattern.md
    - packs/default/consistency.md
  - Matched Rule Unit:
    - packs/default/unsupported-claims.md
```

The prompt builder should not emit freeform prose or abstract bundle descriptions here. It should emit explicit grouped member lists that the agent can translate directly into the `rules[]` array it passes to `lint`.

The agent instructions should clearly say:

- use the provided matched rule units when calling `lint`
- pass the explicit member rules in `rules[]`
- do not invent new groupings

## 8) Per-Rule Severity and Attribution

Bundling does not collapse severity or identity.

Rules may differ in severity. That does not block bundling because:

- severity remains attached to each resolved member rule
- findings emitted from a bundled review remain attributed to the originating rule member
- final reporting still uses original rule `ruleSource` and original per-rule severity

This means the bundle is only an execution grouping for cost and prompt construction. It is not a new semantic rule object.

## 9) Subordinate `agent` Tool

Add a tool named `agent` for bounded delegated sub-agent work initiated by the main review agent.

The sub-agent `agent` tool is not limited to exploration. Its broader purpose is to let the main agent delegate a bounded read-only task into an isolated context window, receive the result, and continue without carrying all of the delegated context forward in the main conversation. This reduces context bloat, can lower token cost, and prevents delegated context from continuously accumulating after the sub-agent task completes.

Initial intended uses:

- gather repo context
- inspect source rule files
- inspect workspace files
- summarize information the main agent may later pass into rule-item `context`

Execution model:

- synchronous
- isolated sub-agent run
- main agent waits for completion before continuing

Sub-agent allowed tools:

- `read_file`
- `search_files`
- `list_directory`
- `search_content`

Sub-agent disallowed tools:

- `lint`
- `agent`

The sub-agent must not recurse and must not be able to trigger review execution directly.

Result shape:

- compact summarized result only
- no transcript returned to the main agent
- no detailed sub-agent-tool chatter returned to the main agent

Approved input shape:

```ts
const ModelCapabilityTierSchema = z.enum([
  "high-capability",
  "mid-capability",
  "low-capability",
]);

const AGENT_TOOL_INPUT_SCHEMA = z.object({
  task: NonBlankString,
  label: NonBlankString.optional(),
  model: ModelCapabilityTierSchema.optional(),
});
```

Approved result shape:

```ts
{
  ok: true,
  result: string,
}
```

The main agent may use the sub-agent result to decide which tools to call next or to populate per-rule `context`.

Sub-agent `agent` model behavior:

- `model` requests a capability tier, not a raw provider model ID
- when `model` is omitted, the sub-agent `agent` defaults to `high-capability`
- the requested tier resolves through the capability-tier fallback system described above
- the main agent can steer sub-agent model choice through tool arguments instead of requiring code changes

## 10) Failure Handling

Failures should be explicit and deterministic.

The whole `lint` call fails before review runs if:

- the `lint` input fails schema validation
- any `ruleSource` in `rules[]` does not resolve to a loaded rule
- the bundled prompt cannot be constructed from the provided rule items
- the file cannot be read

This design does not permit silent partial execution of a malformed bundled lint request.

Not failures:

- a valid bundled lint call producing zero findings
- a member rule producing zero findings
- a well-formed `context` block that turns out not to help

If the sub-agent `agent` tool fails:

- the main agent receives a compact failure result
- the main agent can decide whether to retry, continue without the context, or take another supported read-only action

## 11) Testing

Required test coverage:

The test plan must cover both happy paths and edge cases. Happy-path coverage alone is not sufficient because most of the design risk in this change is in malformed grouped input, attribution preservation, fallback behavior, and sub-agent boundaries.

1. Lint schema tests
- accepts `file + rules[]`
- rejects empty `rules[]`
- rejects blank `reviewInstruction` and blank `context` after trimming
- rejects unknown or malformed rule members before review runs

2. Effective-body tests
- stored rule body only
- `reviewInstruction` replaces the stored rule body for one member only
- `context` appends `Required context for this review:` for one member only
- both together produce override-plus-appended-context for one member only
- mixed member arrays preserve isolation, so one member's override or context does not bleed into another member's effective body

3. Bundled execution tests
- one bundled `lint` call produces one underlying review request
- target file is read once per bundled `lint` call
- findings are recorded with original member `ruleSource`
- findings are recorded with original member severity
- mixed-severity bundles preserve per-member severity in recorded findings
- malformed grouped requests fail the whole `lint` call before review runs
- zero-finding bundled runs still succeed

4. Prompt-builder tests
- system prompt section becomes `Review files and Matched Rule Units`
- grouped member lists are rendered explicitly per file
- deterministic grouping stays stable for the same matched-rule input and token budget
- token-budget boundaries split groups as expected

5. Sub-agent tests
- `agent` tool runs synchronously
- sub-agent only has read-only tools
- sub-agent cannot call `lint`
- sub-agent cannot call `agent`
- `agent` tool defaults to `high-capability` when `model` is omitted
- `agent` tool resolves requested capability tiers using upward-only fallback
- tool result returned to main agent is compact and final-output-only
- sub-agent failures return compact failure output without leaking a transcript
- upward fallback never routes a request to a weaker configured capability tier

## 12) Success Criteria

This design is complete when:

1. The `lint` tool accepts one file and explicit per-rule member arrays.
2. Optional `context` is restored with the exact appended label `Required context for this review:`.
3. Optional `reviewInstruction` and `context` may coexist on the same rule item.
4. One bundled `lint` call produces one underlying review request.
5. Matched rule units are constructed deterministically before the agent run starts.
6. The system prompt exposes grouped matched rule units explicitly.
7. Findings retain original `ruleSource` and severity per member rule.
8. A synchronous sub-agent `agent` tool exists for bounded delegated read-only work with isolated context.
9. Provider-scoped capability-tier model configuration exists for `high-capability`, `mid-capability`, and `low-capability`.
10. The sub-agent `agent` tool can request a capability tier through its `model` argument.
