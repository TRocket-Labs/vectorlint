# Creating Rules for VectorLint

A comprehensive guide to creating powerful, reusable content evaluations using VectorLint's prompt system.

## Table of Contents

- [Overview](#overview)
- [Rule Anatomy](#rule-anatomy)
- [Evaluation Modes](#evaluation-modes)
- [Check Rules](#check-rules)
- [Judge Rules](#judge-rules)
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
- **Score** = LLM-assigned rating (1-4 scale for judge, density-based for check)

- **Severity** = How failures are reported (`error` or `warning`)

---

## Rule Anatomy

Every rule is a Markdown file with two parts:

```markdown
---
# YAML Frontmatter (Configuration)
id: MyEval
name: My Content Evaluator
evaluator: base
type: check
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
│       │   ├── headline-evaluator.md
│       │   └── Technical/           ← Nested organization supported
│       │       └── technical-accuracy.md
│       └── TechCorp/                ← Another company's pack
│           └── brand-voice.md
└── .vectorlint.ini
```

**Pack Naming:** Use company names (e.g., `Acme`, `TechCorp`, `Stripe`) to indicate which style guide the rules implement.

---

## Evaluation Modes

VectorLint uses a single **Base Evaluator** (`evaluator: base`) that operates in two distinct modes, determined by the `type` field:

| Mode       | `type`  | Use Case                              | Scoring                     | Output                  |
| ---------- | ------- | ------------------------------------- | --------------------------- | ----------------------- |
| **Check**  | `check` | Pass/fail checks, counting violations | 10 points - 1 per violation | List of specific issues |
| **Judge**  | `judge` | Multi-dimensional quality scoring     | 0-4 scale per criterion     | Weighted average score  |

### When to Use Each

**Use Check when:**

- You need to find specific errors (e.g., "Find all grammar mistakes")
- The check is binary (Pass/Fail) for each item
- You want a list of specific violations to fix

**Use Judge when:**

- You're measuring quality on a spectrum (e.g., "How engaging is this?")
- You have multiple dimensions (Clarity, Tone, Depth)
- You need weighted importance (some criteria matter more)

---

## Check Rules

Check rules are perfect for finding specific issues. The LLM lists violations, and the score is calculated based on the count of violations.

### Minimal Example

```markdown
---
evaluator: base
type: check
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

## Judge Rules

Judge rules use weighted criteria and a 1-4 rubric for sophisticated quality measurement.

### Structure

```markdown
---
specVersion: 1.0.0
evaluator: base
type: judge
id: HeadlineEvaluator
name: Headline Evaluator

severity: error
criteria:
  - name: Value Communication
    id: ValueCommunication
    weight: 12
  - name: Curiosity Gap
    id: CuriosityGap
    weight: 2
---

You are a headline evaluator... [Your detailed instructions]

## RUBRIC

# Value Communication <weight=12>

### Excellent <score=4>

Specific, immediately appealing benefit

### Good <score=3>

Clear benefit but less specific impact

...
```

### The 1-4 Scoring Scale

VectorLint uses a **1-4 scale** for all judge criteria, which is then normalized to a 1-10 scale:

| LLM Rating | Meaning   | Normalized Score |
| :--------- | :-------- | :--------------- |
| **4**      | Excellent | **10.0**         |
| **3**      | Good      | **7.0**          |
| **2**      | Fair      | **4.0**          |
| **1**      | Poor      | **1.0**          |

### Score Calculation

1.  **Normalization**: We map the 1-4 rating to a 1-10 score using the formula: `1 + ((Rating - 1) / 3) * 9`.
2.  **Weighted Average**: The final score is the weighted average of all normalized criterion scores.

**Example:**

- Criterion: "Value Communication" (weight=12)
- Rating: 3 (Good) -> Normalized: 7.0
- Weighted Points: 7.0 \* 12 = 84 points

---

## Target Specification

The `target` field allows you to:

1. **Specify which part** of content to evaluate (via regex)
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

- If content matches → Evaluation proceeds normally
- If no match → Immediate `error` with the suggestion message

**When `required: false` or omitted:**

- If content matches → Evaluate the matched content
- If no match → Evaluate entire content

---

## Configuration Reference

### Frontmatter Fields

| Field         | Type          | Required | Description                                                        |
| ------------- | ------------- | -------- | ------------------------------------------------------------------ |
| `specVersion` | string/number | No       | Rule specification version (use `1.0.0`)                           |
| `evaluator`   | string        | No       | Evaluator type: `base`, `technical-accuracy` (default: `base`)     |
| `type`        | string        | No       | Mode: `judge` or `check` (default: `check`) |
| `id`          | string        | **Yes**  | Unique identifier (used in error reporting)                        |
| `name`        | string        | **Yes**  | Human-readable name                                                |

| `severity` | string | No | `error` or `warning` (default: `warning`) |
| `evaluateAs` | string | No | `document` or `chunk` - whether to evaluate content as a whole or in chunks (default: `chunk`) |
| `target` | object | No | Content matching specification |
| `criteria` | array | **Yes\*** | List of evaluation criteria (\*required for judge) |

### Criterion Fields

| Field    | Type   | Required | Description                                |
| -------- | ------ | -------- | ------------------------------------------ |
| `name`   | string | **Yes**  | Human-readable criterion name              |
| `id`     | string | **Yes**  | Unique identifier (PascalCase recommended) |
| `weight` | number | No       | Importance weight (default: 1)             |
| `target` | object | No       | Criterion-specific content matching        |

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
You are a headline evaluator for developer blog posts. Assess whether the headline:

1. Clearly communicates a specific benefit
2. Uses natural, conversational language (avoid buzzwords)
3. Creates curiosity without being clickbait

For each criterion, provide a score (0-4) and specific examples from the text.
```

### 2. **Use Meaningful Weights (Subjective)**

Scale weights to reflect real-world importance:

```yaml
criteria:
  # Technical accuracy is critical
  - name: Technical Accuracy
    weight: 40

  # Readability is important
  - name: Readability
    weight: 30
```

### 3. **Provide Context in Prompts**

Help the LLM understand your domain:

```markdown
## CONTEXT BANK

**Developer Audience**: Software engineers, DevOps, QA professionals who value:

- Technical precision over marketing fluff
- Practical examples over theory
```

---

## Examples

### Example 1: Simple Grammar Check (Check)

```markdown
---
evaluator: base
type: check
id: GrammarChecker
name: Grammar Checker
severity: error
---

Check this content for grammar issues, spelling errors, and punctuation mistakes.
Report any errors found with specific examples.
```

### Example 2: Headline Evaluator (Judge)

```markdown
---
specVersion: 1.0.0
evaluator: base
type: judge
id: Headline
name: Headline Evaluator

severity: error
target:
  regex: '^#\s+(.+)$'
  flags: "mu"
  group: 1
  required: true
  suggestion: Add an H1 headline for the article.
criteria:
  - name: Value Communication
    id: ValueCommunication
    weight: 10
  - name: Language Authenticity
    id: LanguageAuthenticity
    weight: 5
---

You are a headline evaluator. Assess the H1 headline for:

1. **Value Communication** (10 points): Does it clearly state what the reader gains?
2. **Language Authenticity** (5 points): Does it use natural, conversational language?

## RUBRIC

# Value Communication <weight=10>

### Excellent <score=4>

Specific, immediately appealing benefit clearly stated

...
```

### Example 3: AI Pattern Detector (Judge)

```markdown
---
specVersion: 1.0.0
evaluator: base
type: judge
id: AIPatterns
name: AI Pattern Detector

severity: warning
criteria:
  - name: Language Authenticity
    id: LanguageAuthenticity
    weight: 40
  - name: Structural Naturalness
    id: StructuralNaturalness
    weight: 30
---

Detect AI-generated writing patterns in this content.

## INSTRUCTION

Scan for common AI patterns:

1. **Buzzwords**: leverage, synergy, elevate
2. **Formulaic transitions**: Moreover, Furthermore
   ...
```

## Resources

- [VectorLint README](./README.md) - Installation and basic usage
- [Configuration Guide](./CONFIGURATION.md) - Project configuration reference (`.vectorlint.ini`)
- [Configuration Example](./vectorlint.ini.example) - Starter configuration template

---

**Happy evaluating! 🚀**
