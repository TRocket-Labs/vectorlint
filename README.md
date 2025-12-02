# VectorLint

A command-line tool that evaluates Markdown content using LLMs and provides quality scores. Think of it like [Vale](https://github.com/errata-ai/vale), but instead of pattern matching, it uses LLMs enabling you to catch subjective issues like clarity, tone, and technical accuracy.

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## Features

- **LLM-based** - Uses LLMs to check content quality
- **CLI Support** - Run locally or in CI/CD pipelines
- **Consistent Evaluations** - Write structured evaluation prompts to get consistent evaluation results
- **Quality Scores** - Set scores for your quality standards

## Scoring System

VectorLint uses a fair, density-based scoring system:

*   **Semi-Objective (Density-Based):** Scores are calculated based on **errors per 100 words**. This ensures that a 1000-word article isn't penalized more than a 100-word paragraph for the same error rate. You can configure **Strictness** (Standard, Strict, Lenient) to control penalties.
*   **Subjective (Normalized):** LLM ratings (1-4) are normalized to a **1-10 scale** using weighted averages, providing granular quality assessment.

## Quick Start

Get up and running in minutes.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/TinyRocketLabs/vectorlint.git
    cd vectorlint
    ```

2.  **Install dependencies & Build:**

    ```bash
    npm install
    npm run build
    ```

3.  **Configure Environment:**

    ```bash
    cp .env.example .env
    # Edit .env with your API key (e.g., OPENAI_API_KEY)
    ```

4.  **Run a check:**

    ```bash
    # Run against a local file
    npm run dev -- path/to/article.md
    ```

## Global Installation (Recommended)

To run `vectorlint` from anywhere on your machine, use `npm link`.

1.  **Build and Link:**

    ```bash
    # Inside the vectorlint directory
    npm run build
    npm link
    ```

2.  **Verify Installation:**

    ```bash
    vectorlint --help
    ```

3.  **Usage:**

    Now you can run `vectorlint` in any project:

    ```bash
    vectorlint my-article.md
    ```

## Configuration

### LLM Provider

VectorLint supports multiple LLM providers:

- **OpenAI**: GPT-4, GPT-3.5, and other OpenAI models
- **Anthropic**: Claude (Opus, Sonnet, Haiku)
- **Azure OpenAI**: Azure-hosted OpenAI models
- **Google Gemini**: Gemini Pro and other Gemini models

**Minimal Setup (OpenAI):**

1.  Copy `.env.example` to `.env`.
2.  Set `LLM_PROVIDER=openai`.
3.  Set `OPENAI_API_KEY=your-key`.

For other providers (Azure, Anthropic, Gemini), see the comments in `.env.example`.

### Search Provider (Optional)

For the `technical-accuracy` evaluator, you can optionally configure a search provider:

- **Perplexity**: Set `SEARCH_PROVIDER=perplexity` and `PERPLEXITY_API_KEY` in `.env`

### Project Config (vectorlint.ini)

VectorLint uses a **file-centric configuration**. Evaluations are organized into **eval packs** (subdirectories), and you configure which packs run on which files.

```bash
cp vectorlint.example.ini vectorlint.ini
```

**Required Directory Structure:**

Organize your evaluations into subdirectories (packs) within `EvalsPath`:

```
.github/evals/
  VectorLint/              ← Eval pack (name is arbitrary)
    grammar-checker.md
    headline-evaluator.md
    Technical/             ← Nested organization supported
      technical-accuracy.md
  CustomPack/              ← You can have multiple packs
    custom-eval.md
```

**Configuration Format:**

Use `[glob/pattern]` sections to specify which packs run on which files:

```ini
# Global settings
EvalsPath=.github/evals
ScanPaths=[content/**/*.md]

# All content - run VectorLint pack
[content/**/*.md]
RunEvals=VectorLint
GrammarChecker.strictness=7

# Technical docs - higher strictness
[content/docs/**/*.md]
RunEvals=VectorLint
GrammarChecker.strictness=9

# Marketing - use custom pack
[content/marketing/**/*.md]
RunEvals=CustomPack

# Drafts - skip all evaluations
[content/drafts/**/*.md]
RunEvals=
```

**Key Settings:**
- `EvalsPath`: Root directory containing your eval pack subdirectories
- `ScanPaths`: Glob patterns for files to scan (e.g., `[content/**/*.md]`)
- `[pattern]` sections: Map file patterns to eval packs using `RunEvals`
- Per-eval overrides: Tune specific evaluations (e.g., `GrammarChecker.strictness=9`)

## Usage Guide

### Running Locally

```bash
# Basic usage (if linked globally)
vectorlint path/to/article.md

# Using npm script (if not linked)
npm run dev -- path/to/article.md

# Debug mode (shows prompts and full JSON response)
vectorlint --verbose --show-prompt --debug-json path/to/article.md

# JSON output formats
vectorlint --output json path/to/article.md        # Native VectorLint JSON
vectorlint --output vale-json path/to/article.md   # Vale-compatible JSON
```

### Creating Prompts

Prompts are Markdown files with YAML frontmatter, organized into eval packs (subdirectories).

**Example** (`VectorLint/tone-checker.md`):

```markdown
---
evaluator: base
type: subjective
id: ToneChecker
name: Tone and Style Check
severity: warning
criteria:
  - name: Friendliness
    id: Friendliness
    weight: 10
  - name: Professionalism
    id: Professionalism
    weight: 8
---

You are a tone evaluator. Assess the content for:

1. **Friendliness**: Is the tone welcoming and approachable?
2. **Professionalism**: Does it maintain professional writing quality?

Provide a score (1-4) for each criterion with specific examples.
```

For detailed guidance, see [CREATING_EVALS.md](./CREATING_EVALS.md).

## Testing

- `npm test`: Run tests in watch mode
- `npm run test:run`: Single run
- `npm run test:ci`: CI run with coverage

Tests live under `tests/` and use Vitest. They validate config parsing (PromptsPath, ScanPaths), file discovery (including prompts exclusion), prompt/file mapping, and prompt aggregation with a mocked provider.