# VectorLint Configuration Guide

A comprehensive reference for configuring VectorLint using `vectorlint.ini`.

## Table of Contents

- [Overview](#overview)
- [Global Settings](#global-settings)
- [LLM Providers](#llm-providers)
- [Search Provider](#search-provider)
- [File Pattern Sections](#file-pattern-sections)
- [Rule-Specific Overrides](#rule-specific-overrides)
- [Strictness Levels](#strictness-levels)
- [Complete Example](#complete-example)

---

## Overview

VectorLint uses a **file-centric configuration** approach. You specify which rule packs run on which files using glob patterns in `vectorlint.ini`.

**Required Directory Structure:**

```
project/
├── .github/
│   └── rules/
│       ├── Acme/                    ← Company style guide pack
│       │   ├── grammar-checker.md
│       │   ├── headline-evaluator.md
│       │   └── Technical/           ← Nested organization supported
│       │       └── technical-accuracy.md
│       └── TechCorp/                ← Another company's pack
│           └── brand-voice.md
└── vectorlint.ini
```

---

## Global Settings

Global settings appear at the top of `vectorlint.ini` before any `[pattern]` sections.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `RulesPath` | string | `.github/rules` | Root directory containing your rule pack subdirectories |
| `Concurrency` | integer | `4` | Number of concurrent evaluations to run |
| `DefaultSeverity` | string | `warning` | Default severity level: `warning` or `error` |

**Example:**

```ini
# Global settings
RulesPath=.github/rules
Concurrency=4
DefaultSeverity=warning
```

---

## LLM Providers

VectorLint supports multiple LLM providers. Configure them using environment variables in your `.env` file.

| Provider | `LLM_PROVIDER` Value | Required API Key Variable |
|----------|----------------------|---------------------------|
| **OpenAI** (Default) | `openai` | `OPENAI_API_KEY` |
| **Anthropic** | `anthropic` | `ANTHROPIC_API_KEY` |
| **Azure OpenAI** | `azure-openai` | *See `.env.example`* |
| **Google Gemini** | `gemini` | `GEMINI_API_KEY` |

---

## Search Provider

For rules that require external knowledge (like `technical-accuracy`), you can configure a search provider.

| Setting | Environment Variable | Value | Description |
|---------|----------------------|-------|-------------|
| Provider | `SEARCH_PROVIDER` | `perplexity` | The search service to use |
| API Key | `PERPLEXITY_API_KEY` | `pplx-...` | API key for the provider |

**Setup:**

Add these to your `.env` file:

```bash
SEARCH_PROVIDER=perplexity
PERPLEXITY_API_KEY=your-key
```

---

## File Pattern Sections

Use `[glob/pattern]` sections to map file patterns to rule packs.

### Syntax

```ini
[glob/pattern]
RunRules=PackName
```

- **Pattern**: Standard glob pattern (e.g., `**/*.md`, `content/docs/**/*.md`)
- **RunRules**: Name of the rule pack subdirectory to run on matching files
  - Use company names (e.g., `Acme`, `TechCorp`) for style guide packs
  - Leave empty (`RunRules=`) to skip all rules for matching files

### Examples

```ini
# All markdown files - run Acme style guide
[**/*.md]
RunRules=Acme

# Technical docs - run Acme pack
[content/docs/**/*.md]
RunRules=Acme

# Marketing - run TechCorp pack
[content/marketing/**/*.md]
RunRules=TechCorp

# Drafts - skip all rules
[content/drafts/**/*.md]
RunRules=
```

### Pattern Precedence

When multiple patterns match a file, **the most specific pattern wins**. Specificity is determined by:

1. **Exact matches** (highest priority)
2. **Longer paths** (more specific)
3. **Fewer wildcards** (more specific)

**Example:**

```ini
# Less specific - applies to all markdown
[**/*.md]
RunRules=Acme

# More specific - overrides for docs
[content/docs/**/*.md]
RunRules=Acme
GrammarChecker.strictness=9
```

A file at `content/docs/api.md` will use the second pattern (higher strictness).

---

## Rule-Specific Overrides

You can tune individual rules within a pattern section using `RuleID.parameter=value` syntax.

### Syntax

```ini
[pattern]
RunRules=PackName
RuleID.parameter=value
```

- **RuleID**: The `id` field from the rule's YAML frontmatter
- **parameter**: The specific setting to override (e.g., `strictness`, `threshold`)
- **value**: The new value for this parameter

### Common Overrides

#### Strictness (Semi-Objective Rules)

Controls the penalty weight for error density in semi-objective rules.

```ini
[content/blog/**/*.md]
RunRules=Acme
GrammarChecker.strictness=8
```

See [Strictness Levels](#strictness-levels) for the scale.

#### Threshold (Subjective Rules)

Sets the minimum passing score for subjective rules.

```ini
[content/marketing/**/*.md]
RunRules=Acme
HeadlineEvaluator.threshold=8.0
```

---

## Strictness Levels

For **semi-objective rules** (like grammar checkers), strictness controls how harshly errors are penalized based on error density.

### The Scale (1-10)

| Level | Name | Penalty | Use Case |
|-------|------|---------|----------|
| **1-3** | Lenient | 5 points per 1% error density | Drafts, brainstorming |
| **4-7** | Standard | 10 points per 1% error density | General content |
| **8-10** | Strict | 20 points per 1% error density | Published docs, legal content |

### How It Works

VectorLint scores based on **error density** (errors per 100 words):

- **In a 100-word paragraph:** 1 error = 1% density
  - Lenient (5): Lose 5 points
  - Standard (10): Lose 10 points
  - Strict (20): Lose 20 points

- **In a 1,000-word article:** 1 error = 0.1% density
  - Lenient (5): Lose 0.5 points
  - Standard (10): Lose 1 point
  - Strict (20): Lose 2 points

**Starting score is always 10.0.** Scores below 10.0 trigger warnings or errors.

### Examples

```ini
# Lenient for drafts
[content/drafts/**/*.md]
RunRules=Acme
GrammarChecker.strictness=3

# Standard for blog posts
[content/blog/**/*.md]
RunRules=Acme
GrammarChecker.strictness=7

# Strict for published docs
[content/docs/**/*.md]
RunRules=Acme
GrammarChecker.strictness=9
```

---

## Complete Example

```ini
# VectorLint Configuration
# Global settings
RulesPath=.github/rules
Concurrency=4
DefaultSeverity=warning

# Default rules for all markdown files
[**/*.md]
RunRules=Acme

# Blog content - standard strictness
[content/blog/**/*.md]
RunRules=Acme
GrammarChecker.strictness=7
HeadlineEvaluator.threshold=7.5

# Technical documentation - higher strictness
[content/docs/**/*.md]
RunRules=Acme
GrammarChecker.strictness=9
TechnicalAccuracy.threshold=8.0

# Marketing content - use custom pack
[content/marketing/**/*.md]
RunRules=TechCorp
BrandVoice.strictness=8

# Drafts - skip all rules
[content/drafts/**/*.md]
RunRules=
```

---

## See Also

- [Creating Rules](./CREATING_RULES.md) - How to write custom rules
- [README](./README.md) - Installation and quick start
- [Example Config](./vectorlint.ini.example) - Starter configuration template
