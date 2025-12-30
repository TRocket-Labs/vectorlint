# Repository Guidelines

This repository implements VectorLint — a prompt‑driven, structured‑output content evaluator. Use this guide to navigate the codebase, run it locally, and contribute safely.

## Project Structure & Module Organization

- `src/`
  - `index.ts` — CLI entry; orchestrates config, discovery, evaluation, reporting
  - `boundaries/` — external data validation (config, CLI args, env vars, YAML, API responses)
  - `cli/` — command definitions and CLI orchestration
  - `config/` — configuration loading and management
  - `errors/` — custom error types and validation errors
  - `evaluators/` — evaluation logic (base evaluator, registry, specific evaluators)
  - `output/` — TTY formatting (reporter, evidence location)
  - `prompts/` — YAML frontmatter parsing, schema validation, eval loading and mapping
  - `providers/` — LLM abstractions (OpenAI, Anthropic, Azure, Perplexity), request builder, provider factory
  - `scan/` — file discovery (fast‑glob) honoring config and exclusions
  - `schemas/` — Zod schemas for all external data (API responses, config, CLI, env)
  - `types/` — TypeScript type definitions
- `evals/` — user evaluations (.md with YAML frontmatter)
- `tests/` — Vitest specs for config, scanning, evaluation, providers
- `vectorlint.example.ini` — template for project config (copy to `.vectorlint.ini`)

## Build, Test, and Development Commands

- `npm run dev -- <paths>` — run CLI with tsx (no build)
- `npm run build` — bundle with tsup (ESM, sourcemaps, type declarations)
- `npm start <paths>` — run built CLI
- `npm run lint` — run ESLint
- `npm run lint:fix` — run ESLint with auto-fix
- `npm test` — Vitest in watch mode
- `npm run test:run` — single test run
- `npm run test:ci` — run with coverage

## Coding Style & Naming Conventions

- TypeScript ESM; prefer explicit imports and narrow types
- Indentation: 2 spaces; avoid trailing whitespace
- Eval YAML: `name` (human), `id` (PascalCase), criteria `id` (PascalCase)
- IDs shown as `PromptId.CriterionId` in output

## Testing Guidelines

- Framework: Vitest; locate tests under `tests/` with `*.test.ts`
- Focus tests: config parsing, file discovery, schema/structured output, locator
- Use dependency injection: mock providers; do not hit network in unit tests

## Commit & Pull Request Guidelines

- Commits: concise subject line (<72 chars), followed by bullet points for changes
- Group related changes; avoid drive‑by formatting
- PRs: describe motivation, approach, and testing; include sample CLI output when relevant

### Commit Message Style

- Subject: imperative mood, ≤72 chars, single theme
  - Example: `Add overall { severity } to prompt YAML`
- Body: concise bullet points for what/why/impact
  - Focus on actionable specifics and user‑visible behaviors
  - Prefer lists over paragraphs for scanability
- Trailers (when applicable):
  - `BREAKING:` to call out breaking changes
  - `Co-authored-by:` for pair work
  - `Refs:` or `Fixes:` to link issues/PRs

## Architecture & Principles

- Boundary validation: all external data (files, CLI, env, APIs) validated at system boundaries using Zod schemas
- Type safety: strict TypeScript with no `any`; use `unknown` + schema validation for external data
- Dependency inversion: depend on `LLMProvider` and `SearchProvider` interfaces; keep providers thin (transport only)
- Dependency injection: inject `RequestBuilder` via provider constructor to avoid coupling
- Separation of concerns: evals define rubric; schemas enforce structure; CLI orchestrates; evaluators process; reporters format
- Extensibility: add providers by implementing `LLMProvider` or `SearchProvider`; add evaluators via registry pattern
- Error handling: custom error types with proper inheritance; catch blocks use `unknown` type

## Directory Creation Principles

- Start flat; extract only when there’s a clear, repeated need (≥3 related files)
- Group by responsibility with clear nouns (providers, prompts, output), avoid vague buckets
- Keep directories cohesive; if a file doesn’t fit, move it
- Prefer simplicity over prediction; refactor when the need becomes real
- Optimize for discoverability; contributors should guess locations on first try
- Maintain acyclic dependencies (CLI → prompts/providers/output)
- Add a brief rationale when introducing a new folder; rename rather than accumulate near‑duplicates

## Rule Pack System

VectorLint uses a **pack-based organization** for rules:

- All rules must be organized into **subdirectories** (packs) within `RulesPath`
- Pack names are **arbitrary**. Recommended practice is to use company names (e.g., `Acme`, `TechCorp`, `Stripe`) to indicate which style guide the rules implement
- The system recursively loads **all `.md` files** from within each pack
- Multiple packs can be used simultaneously: `RunRules=Acme,Marketing`

**Directory Structure:**
```
.github/rules/
  Acme/                    ← Company style guide pack
    grammar-checker.md
    Technical/             ← Nested organization supported
      technical-accuracy.md
  TechCorp/                ← Another company's style guide
    brand-voice.md
```

**File-Centric Configuration:**

Use `[glob/pattern]` sections in `.vectorlint.ini` to specify which packs run on which files:

```ini
# Global settings
RulesPath=.github/rules
Concurrency=4
DefaultSeverity=warning

# All markdown files - run Acme style guide
[**/*.md]
RunRules=Acme
GrammarChecker.strictness=7

# Technical docs - higher strictness
[docs/**/*.md]
RunRules=Acme
GrammarChecker.strictness=9

# Marketing - different pack
[marketing/**/*.md]
RunRules=Acme
GrammarChecker.strictness=9

# Drafts - skip all rules
[drafts/**/*.md]
RunRules=
```

## Output Formats

VectorLint supports multiple output formats via the `--output` flag:

- `line` (default): Human-readable terminal output with colored scores
- `json`: Native VectorLint JSON format with detailed score breakdowns
- `vale-json`: Vale-compatible JSON format for integration with Vale-supporting tools

## Security & Configuration Tips

- Copy `vectorlint.example.ini` → `.vectorlint.ini`; set `RulesPath`, `ScanPaths`, `Concurrency`
- Organize evaluations into pack subdirectories (e.g., `RulesPath/VectorLint/`)
- Use `[glob/pattern]` sections with `RunRules=PackName` to map files to rule packs
- Copy `.env.example` → `.env` for provider credentials (OpenAI, Anthropic, Azure, Gemini, Perplexity)
- All environment variables validated via Zod schemas in `src/boundaries/env-parser.ts`
- Never commit secrets; `.env` is gitignored
- Evals must include YAML frontmatter; the tool appends evidence instructions automatically

## Provider Support

### LLM Providers

- OpenAI: GPT-4 and GPT-3.5 models
- Anthropic: Claude models (Opus, Sonnet, Haiku)
- Azure OpenAI: Azure-hosted OpenAI models
- Google Gemini: Gemini Pro and other Gemini models

### Search Providers

- Perplexity: Sonar models with web search capabilities (used by technical-accuracy evaluator)
