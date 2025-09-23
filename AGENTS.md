# Repository Guidelines

This repository implements VectorLint — a prompt‑driven, structured‑output content evaluator. Use this guide to navigate the codebase, run it locally, and contribute safely.

## Project Structure & Module Organization

- `src/`
  - `index.ts` — CLI entry; orchestrates config, discovery, evaluation, reporting
  - `config/Config.ts` — loads `vectorlint.ini` (PromptsPath, ScanPaths, Concurrency)
  - `prompts/` — YAML frontmatter parsing and JSON schema (`Schema.ts`)
  - `providers/` — LLM abstractions (`LLMProvider.ts`), Azure provider, `RequestBuilder.ts`
  - `scan/` — file discovery (fast‑glob) honoring config and exclusions
  - `locate/` — evidence locator (quote + anchors → line:col)
  - `output/Reporter.ts` — TTY formatting (colors, columns, summary)
- `prompts/` — user prompts (.md with YAML frontmatter)
- `tests/` — Vitest specs for config, scanning, evaluation
- `vectorlint.example.ini` — template for project config (copy to `vectorlint.ini`)

## Build, Test, and Development Commands

- `npm run dev -- <paths>` — run CLI with tsx (no build)
- `npm run build` — TypeScript compile to `dist/`
- `npm start <paths>` — run built CLI
- `npm test` — Vitest in watch mode
- `npm run test:run` — single test run
- `npm run test:ci` — run with coverage

## Coding Style & Naming Conventions

- TypeScript ESM; prefer explicit imports and narrow types
- Indentation: 2 spaces; avoid trailing whitespace
- Prompt YAML: `name` (human), `id` (PascalCase), criteria `id` (PascalCase)
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
  - Example: `Add overall { threshold, severity } to prompt YAML`
- Body: concise bullet points for what/why/impact
  - Focus on actionable specifics and user‑visible behaviors
  - Prefer lists over paragraphs for scanability
- Trailers (when applicable):
  - `BREAKING:` to call out breaking changes
  - `Co-authored-by:` for pair work
  - `Refs:` or `Fixes:` to link issues/PRs

## Architecture & Principles

- Dependency inversion: depend on `LLMProvider` interface; keep providers thin (transport only)
- Dependency injection: inject `RequestBuilder` via provider constructor to avoid coupling
- Separation of concerns: prompts define rubric; `Schema` enforces outputs; CLI orchestrates; locator is pure
- Extensibility: add providers by implementing `LLMProvider`; avoid embedding product logic in transports

## Directory Creation Principles

- Start flat; extract only when there’s a clear, repeated need (≥3 related files)
- Group by responsibility with clear nouns (providers, prompts, output), avoid vague buckets
- Keep directories cohesive; if a file doesn’t fit, move it
- Prefer simplicity over prediction; refactor when the need becomes real
- Optimize for discoverability; contributors should guess locations on first try
- Maintain acyclic dependencies (CLI → prompts/providers/output)
- Add a brief rationale when introducing a new folder; rename rather than accumulate near‑duplicates

## Security & Configuration Tips

- Copy `vectorlint.example.ini` → `vectorlint.ini`; set `PromptsPath`, `ScanPaths`, `Concurrency`
- `.env` for Azure: `AZURE_OPENAI_*`; never commit secrets
- Prompts must include YAML frontmatter; the tool appends evidence instructions automatically
