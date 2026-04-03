# Execution Log

- **Plan**: `docs/plans/2026-04-03-agent-rule-units-and-subordinate-agent.md`
- **Issue**: not provided yet
- **Started**: 2026-04-03
- **Status**: in-progress

---

## Tasks

### Task: Add provider-scoped capability-tier config
- **Status**: completed
- **What was done**: Added provider-scoped optional capability-tier env fields, introduced a shared upward-only capability resolver, and updated both config templates with the new provider-specific keys. Added focused parser, resolver, and global-config coverage for OpenAI, Anthropic, Gemini, Bedrock, and Azure deployment-name variants.
- **Files changed**: `.env.example`, `src/config/global-config.ts`, `src/providers/model-capability.ts`, `src/schemas/env-schemas.ts`, `tests/env-parser.test.ts`, `tests/global-config.test.ts`, `tests/provider-factory.test.ts`

### Task: Add capability-aware provider wiring for agent mode
- **Status**: completed
- **What was done**: Added a capability-aware provider bundle that reuses the shared provider factory, extended the agent loop provider contract to return final text, and wired agent mode to use separate high-capability loop and mid-capability lint providers while preserving the single-provider fallback for existing callers.
- **Files changed**: `src/agent/executor.ts`, `src/cli/commands.ts`, `src/cli/orchestrator.ts`, `src/cli/types.ts`, `src/providers/capability-provider-bundle.ts`, `src/providers/llm-provider.ts`, `src/providers/provider-factory.ts`, `src/providers/vercel-ai-provider.ts`, `tests/orchestrator-agent-output.test.ts`, `tests/provider-factory.test.ts`, `tests/providers/vercel-ai-provider-agent-loop.test.ts`

### Task: Expand the agent tool contracts
- **Status**: completed
- **What was done**: Replaced the lint tool contract with an explicit `rules[]` payload, added the subordinate `agent` tool input schema with capability-tier selection, and registered the new tool descriptions so the runtime can build on stable contracts.
- **Files changed**: `src/agent/tools-registry.ts`, `src/agent/types.ts`, `tests/agent/types-contract.test.ts`

### Task: Build deterministic matched rule units
- **Status**: completed
- **What was done**: Extracted shared token estimation, added deterministic matched-rule-unit grouping under a token budget, updated the system prompt to render matched rule units explicitly per file, and taught the executor to precompute those units before starting the agent loop.
- **Files changed**: `src/agent/executor.ts`, `src/agent/prompt-builder.ts`, `src/agent/rule-units.ts`, `src/boundaries/user-instruction-loader.ts`, `src/utils/token-estimate.ts`, `tests/agent/agent-executor.test.ts`, `tests/agent/prompt-builder.test.ts`, `tests/agent/rule-units.test.ts`
