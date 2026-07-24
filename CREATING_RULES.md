# Creating Rules for VectorLint

A comprehensive guide to creating powerful, reusable content reviews using VectorLint's prompt system.

## Table of Contents

- [Overview](#overview)
- [Rule Anatomy](#rule-anatomy)
- [How Rules Work](#how-rules-work)
- [Target Specification](#target-specification)
- [Configuration Reference](#configuration-reference)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

VectorLint rules are Markdown files with YAML frontmatter that define how your content should be assessed. They're quality checks powered by LLMs instead of regex patterns.

**Key Concepts:**

- **Rule = Prompt file** (`.md` file organized in rule packs)
- **Pack** = Subdirectory containing related rules (typically named after a company/style guide)
- **Criteria** = Individual quality checks within a rule
- **Score** = Density-based quality score derived from violation count

- **Severity** = How failures are reported (`error` or `warning`)

---

## Rule Anatomy

Every rule is a Markdown file with two parts:

```markdown
---
# YAML Frontmatter (Configuration)
id: MyRule
name: My Content Reviewer
severity: error
---

# Markdown Body (Instructions for the LLM)

Your detailed instructions for the LLM go here...
```

### File Location

Organize rules into **pack subdirectories** within `RulesPath` (specified in `.vectorlint.ini`):

```
project/
├── .github/
│   └── rules/
│       ├── Acme/                    ← Company style guide pack
│       │   ├── grammar-checker.md
│       │   └── headline-reviewer.md
│       └── TechCorp/                ← Another company's pack
│           └── brand-voice.md
└── .vectorlint.ini
```

**Pack Naming:** Use company names (e.g., `Acme`, `TechCorp`, `Stripe`) to indicate which style guide the rules implement.

---

## How Rules Work

The LLM lists specific violations, and VectorLint calculates a density-based
score from the verified findings.

### Minimal Example

```markdown
---
id: GrammarChecker
name: Grammar Checker
severity: error
---

Check this content for grammar issues, spelling errors, and punctuation mistakes.
```

### How It Works

1.  **LLM analyzes content** and lists specific violations.
2.  **Score Calculation (Density-Based)**:
    VectorLint scores based on **Error Density** (errors per 100 words), ensuring fairness across document lengths.

    **The "100 vs 1,000" Rule:**

    - **In a 100-word paragraph:** 1 error is a high density (1%). You lose **10 points** (Standard strictness).
    - **In a 1,000-word article:** 1 error is a low density (0.1%). You lose only **1 point**.

    **Note:** Higher strictness means a higher penalty for the same error density.

3.  **Strictness Levels**:
    You can control the penalty weight in your prompt frontmatter using a number or a preset name:

    - **Standard (10):** Lose 10 points per 1% error density.
    - **Strict (20):** Lose 20 points per 1% error density.
    - **Lenient (5):** Lose 5 points per 1% error density.

4.  **Status**:
    - Score < 10.0 = `warning` or `error` (based on severity)
    - Score 10.0 = Pass (no output)

---

## Target Specification

The `target` field allows you to:

1. **Specify which part** of content to review (via regex)
2. **Require certain content** to exist (e.g., "must have an H1 headline")
3. **Provide helpful suggestions** when content is missing

### Basic Target

```yaml
target:
  regex: '^#\s+(.+)$' # Match H1 headline
  flags: "mu" # Multiline + Unicode
  group: 1 # Capture group 1 (the headline text)
  required: true # Content must match
  suggestion: Add an H1 headline for the article.
```

### Target Behavior

**When `required: true`:**

- If content matches → Review proceeds normally
- If no match → Immediate `error` with the suggestion message

**When `required: false` or omitted:**

- If content matches → Review the matched content
- If no match → Review entire content

---

## Configuration Reference

### Frontmatter Fields

| Field         | Type          | Required | Description                                                    |
| ------------- | ------------- | -------- | -------------------------------------------------------------- |
| `specVersion` | string/number | No       | Rule specification version (use `1.0.0`)                       |
| `id`          | string        | **Yes**  | Unique identifier (used in error reporting)                    |
| `name`        | string        | **Yes**  | Human-readable name                                            |
| `severity`    | string        | No       | `error` or `warning` (default: `warning`)                      |
| `strictness`  | number/string | No       | Density penalty: a positive number, `lenient`, `standard`, or `strict` |
| `target`      | object        | No       | Content matching specification                                 |

---

## Best Practices

### 1. **Write Clear Instructions**

Your LLM prompt is the most important part. Be specific:

❌ **Bad:**

```markdown
Check if the headline is good.
```

✅ **Good:**

```markdown
You are a headline reviewer for developer blog posts. Assess whether the headline:

1. Clearly communicates a specific benefit
2. Uses natural, conversational language (avoid buzzwords)
3. Creates curiosity without being clickbait

For each violation, quote the exact text and suggest a concrete fix.
```

### 2. **Provide Context in Prompts**

Help the LLM understand your domain:

```markdown
## CONTEXT BANK

**Developer Audience**: Software engineers, DevOps, QA professionals who value:

- Technical precision over marketing fluff
- Practical examples over theory
```

---

## Examples

### Example 1: Simple Grammar Rule

```markdown
---
id: GrammarChecker
name: Grammar Checker
severity: error
---

Check this content for grammar issues, spelling errors, and punctuation mistakes.
Report any errors found with specific examples.
```

## Resources

- [VectorLint README](./README.md) - Installation and basic usage
- [Configuration Guide](./CONFIGURATION.md) - Project configuration reference (`.vectorlint.ini`)
- [Configuration Example](./vectorlint.ini.example) - Starter configuration template

---

**Happy reviewing! 🚀**
