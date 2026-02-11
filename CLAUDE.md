# Repository Guidelines

This repository implements VectorLint — a prompt‑driven, structured‑output content evaluator. Use this guide to navigate the codebase, run it locally, and contribute safely.

## Project Structure & Module Organization

- `src/`
  - `index.ts` — CLI entry; orchestrates config, discovery, evaluation, reporting
  - `boundaries/` — external data validation (config, CLI args, env vars, YAML, API responses)
  - `chunking/` — content chunking for large documents (recursive chunker, merger, utilities)
  - `cli/` — command definitions and CLI orchestration
  - `config/` — configuration loading and management
  - `errors/` — custom error types and validation errors
  - `evaluators/` — evaluation logic (base evaluator, registry, specific evaluators)
  - `output/` — TTY formatting (reporter, evidence location, line numbering)
  - `prompts/` — YAML frontmatter parsing, schema validation, directive loading
  - `providers/` — LLM abstractions (OpenAI, Anthropic, Azure, Gemini), request builder, provider factory
  - `scan/` — file discovery (fast‑glob) honoring config and exclusions
  - `schemas/` — Zod schemas for all external data (API responses, config, CLI, env)
  - `scoring/` — score calculation (density-based for check, rubric-based for judge)
  - `types/` — TypeScript type definitions
- `presets/` — bundled rule packs (e.g., `VectorLint/`)
- `tests/` — Vitest specs for config, scanning, evaluation, providers

## Configuration System

### Quick Start

Run `vectorlint init` to generate configuration files. This automatically sets up:
- `.vectorlint.ini` with `RunRules=VectorLint` (the bundled preset)
- `~/.vectorlint/config.toml` for LLM provider API keys

### Bundled Presets

VectorLint ships with a `VectorLint` preset in `presets/VectorLint/` containing:
- `ai-pattern.md` — Detects AI-generated writing patterns
- `pseudo-advice.md` — Detects pseudo-advice (vague guidance without actionable details)
- `repetition.md` — Detects redundant content between sections

**Presets are automatically available** — no need to set `RulesPath` to use them. Just set:

```ini
[**/*.md]
RunRules=VectorLint
```

### Custom Rules

For custom rules, set `RulesPath` to your rules directory:

```ini
RulesPath=.github/rules

[**/*.md]
RunRules=Acme
```

Rules must be organized into subdirectories (packs) within `RulesPath`.

### Zero-Config Mode

If you just want to evaluate against a user instruction guide without specific rules:
1. Create a `VECTORLINT.md` file with your user instruction content
2. Run `vectorlint doc.md` — VectorLint creates a synthetic rule from your user instructions

## Build, Test, and Development Commands

- `npm run dev -- <paths>` — run CLI with tsx (no build)
- `npm run build` — bundle with tsup (ESM, sourcemaps, type declarations)
- `npm start <paths>` — run built CLI
- `npm run lint` — run ESLint
- `npm run lint:fix` — run ESLint with auto-fix
- `npm test` — Vitest in watch mode
- `npm run test:run` — single test run
- `npm run test:ci` — run with coverage

## Prompt Architecture

VectorLint assembles prompts in this order:

1. **Directive** (`src/prompts/directive-loader.ts`) — Role definition, task, and evaluation instructions
2. **User Instructions** (`VECTORLINT.md`) — Optional global style context
3. **Rule** (the prompt body from the rule file) — Specific evaluation criteria

The content to evaluate is sent as a **user message** with line numbers prepended.

### Chunking

For documents >600 words, VectorLint automatically chunks content:
- Uses recursive splitting (paragraphs → lines → sentences → words)
- Each chunk is evaluated separately
- Results are merged and deduplicated
- Disable with `evaluateAs: document` in rule frontmatter

## Coding Style & Naming Conventions

- TypeScript ESM; prefer explicit imports and narrow types
- Indentation: 2 spaces; avoid trailing whitespace
- Rule YAML: `name` (human), `id` (PascalCase), criteria `id` (PascalCase)
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
- Separation of concerns: rules define rubric; schemas enforce structure; CLI orchestrates; evaluators process; reporters format
- Extensibility: add providers by implementing `LLMProvider` or `SearchProvider`; add evaluators via registry pattern
- Error handling: custom error types with proper inheritance; catch blocks use `unknown` type

## Output Formats

VectorLint supports multiple output formats via the `--output` flag:

- `line` (default): Human-readable terminal output with colored scores
- `json`: Native VectorLint JSON format with detailed score breakdowns
- `vale-json`: Vale-compatible JSON format for integration with Vale-supporting tools

## Provider Support

### LLM Providers

- OpenAI: GPT-4o and other OpenAI models
- Anthropic: Claude models (Opus, Sonnet, Haiku)
- Azure OpenAI: Azure-hosted OpenAI models
- Google Gemini: Gemini Pro and other Gemini models

### Search Providers

- Perplexity: Sonar models with web search capabilities (used by technical-accuracy evaluator)
