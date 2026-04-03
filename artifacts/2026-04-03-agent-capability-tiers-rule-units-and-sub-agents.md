# Agent Capability Tiers, Rule Units, and Sub-Agents

## 1. Capability Changes

After merge, you can:

- configure provider-scoped `high-capability`, `mid-capability`, and `low-capability` models or deployment names
- run agent mode with deterministic matched rule units and bundled multi-rule lint requests
- delegate bounded read-only workspace analysis to sub-agents through the `agent` tool

## 2. Boundary Changes

- Agent-mode tool contract:
  - `lint` now takes `file` plus `rules[]`
  - each rule item supports `ruleSource`, optional `reviewInstruction`, and optional `context`
  - `agent` takes `task`, optional `label`, and optional capability-tier `model`
- Config/env contract:
  - new provider-specific capability-tier fields were added for OpenAI, Azure OpenAI, Anthropic, Gemini, and Bedrock
  - Azure uses deployment-name fields instead of raw model IDs

## 3. High-Level Flow

1. Agent mode resolves the workspace targets and loaded rules.
2. The runtime precomputes deterministic matched rule units under a token budget.
3. The top-level agent loop runs with the `high-capability` provider tier.
4. When the agent calls `lint`, the runtime reads the file once, builds one bundled prompt from `rules[]`, and sends one structured review request with the `mid-capability` tier.
5. Findings are recorded with their original `ruleSource` and per-rule severity.
6. When the agent calls `agent`, the runtime launches a bounded sub-agent with read-only tools only and returns a compact result or compact error.

## 4. Invariants

- Capability fallback is upward-only within the active provider:
  - `low-capability -> mid-capability -> high-capability -> provider default`
  - `mid-capability -> high-capability -> provider default`
- Bundled linting must preserve original `ruleSource` attribution for every finding.
- Sub-agents remain read-only and cannot call `lint`, recurse into `agent`, write files, or finalize the main review session.
- Agent mode stays a review-only system; this change does not introduce edit/write behavior.

## 5. Failure Modes and Signals

- Misconfigured capability-tier env vars:
  - noticed through env parsing or provider-factory test failures
- Bad bundled lint payloads or unknown `ruleSource` entries:
  - fail the whole lint call before review runs
- Sub-agent execution failure:
  - returned to the main agent as a compact `{ ok: false, error }` payload

## 6. Verification

Checks run:

- `npm run build`
- `npm run lint`
- `npm run test:run -- tests/agent tests/providers tests/orchestrator-agent-output.test.ts tests/provider-factory.test.ts tests/env-parser.test.ts tests/global-config.test.ts`

Quick manual verification:

1. Configure one provider with capability-tier env vars.
2. Run `vectorlint <file> --mode agent --output json`.
3. Confirm bundled findings keep per-rule `ruleSource`.
4. Confirm delegated `agent` work returns compact sub-agent output and never exposes write or recursive tools.

## 7. Rollback

1. Revert the commits introduced on `feat/sub-agents`.
2. Remove any newly added capability-tier env values if they were applied in operator environments.
3. Re-run the verification commands above to confirm the repository is back on the prior agent-mode behavior.
