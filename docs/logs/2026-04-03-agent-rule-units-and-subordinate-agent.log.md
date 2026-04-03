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
