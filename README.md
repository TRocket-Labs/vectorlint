# VectorLint

A command-line tool that evaluates Markdown content using LLMs and provides quality scores. Think of it like [Vale](https://github.com/errata-ai/vale), but instead of pattern matching, it uses LLMs enabling you to catch subjective issues like clarity, tone, and technical accuracy.

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## What You Can Do with VectorLint
- **SEO Optimization** - Check if content follows SEO best practices.
- **AI-Generated Content** - Detect AI-generated writing patterns.
- **Technical Accuracy** - Verify claims and catch outdated or incorrect technical information
- **Tone & Voice Consistency** - Ensure content matches appropriate tone for your audience

If you can write a prompt for it, you can lint it with VectorLint.

## Scoring System

VectorLint uses a fair, density-based scoring system:

*   **Semi-Objective (Density-Based):** Scores are calculated based on **errors per 100 words**. This ensures that a 1000-word article isn't penalized more than a 100-word paragraph for the same error rate. You can configure **Strictness** (Standard, Strict, Lenient) to control penalties.
*   **Subjective (Normalized):** LLM ratings (1-4) are normalized to a **1-10 scale** using weighted averages, providing granular quality assessment.

## Installation

### NPM Installation (Recommended)

Install globally from npm:

```bash
npm install -g vectorlint
```

Or use with npx without installing:

```bash
npx vectorlint path/to/article.md
```

### Verify Installation

```bash
vectorlint --help
```

## Quick Start

1.  **Configure Environment:**

    ```bash
    # Create .env file in your project directory
    cp .env.example .env
    # Edit .env with your API key (e.g., OPENAI_API_KEY)
    ```

2.  **Run a check:**

    ```bash
    vectorlint path/to/article.md
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

VectorLint uses a **file-centric configuration**. Evaluations are organized into **rule packs** (subdirectories), and you configure which packs run on which files.

```bash
cp vectorlint.example.ini vectorlint.ini
```

**Required Directory Structure:**

Organize your evaluations into subdirectories (packs) within `RulesPath`:

```
.github/rules/
  Acme/                    ← Company style guide pack
    grammar-checker.md
    headline-evaluator.md
    Technical/             ← Nested organization supported
      technical-accuracy.md
  TechCorp/                ← Another company's style guide
    brand-voice.md
```

**Configuration Format:**
Use `[glob/pattern]` sections to specify which packs run on which files:

```ini
# Global settings
RulesPath=.github/rules
Concurrency=4
DefaultSeverity=warning

# All content - run Acme style guide
[content/**/*.md]
RunRules=Acme
GrammarChecker.strictness=7

# Technical docs - higher strictness
[content/docs/**/*.md]
RunRules=Acme
GrammarChecker.strictness=9

# Marketing - different company pack
[content/marketing/**/*.md]
RunRules=TechCorp

# Drafts - skip all rules
[content/drafts/**/*.md]
RunRules=
```

**Key Settings:**
- `RulesPath`: Root directory containing your rule pack subdirectories
- `Concurrency`: Number of concurrent evaluations (default: 4)
- `DefaultSeverity`: Default severity level (`warning` or `error`)
- `[pattern]` sections: Map file patterns to rule packs using `RunRules`
- Per-eval overrides: Tune specific evaluations (e.g., `GrammarChecker.strictness=9`)

## Usage Guide

### Creating Rules

Rules are Markdown files with YAML frontmatter, organized into rule packs (subdirectories).

**Example** (`Acme/tone-checker.md`):

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

For detailed guidance, see [CREATING_RULES.md](./CREATING_RULES.md).
