# Creating Evals for VectorLint

A comprehensive guide to creating powerful, reusable content evaluations using VectorLint's prompt system.

## Table of Contents

- [Overview](#overview)
- [Eval Anatomy](#eval-anatomy)
- [Two Types of Evals](#two-types-of-evals)
- [Writing Basic Evals](#writing-basic-evals)
- [Writing Advanced Evals](#writing-advanced-evals)
- [Target Specification](#target-specification)
- [Configuration Reference](#configuration-reference)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

VectorLint evaluations (evals) are Markdown files with YAML frontmatter that define how your content should be assessed. Think of them as "rules" for quality checks, but powered by LLMs instead of regex patterns.

**Key Concepts:**

- **Eval = Prompt file** (`.md` file in your `prompts/` directory)
- **Criteria** = Individual quality checks within an eval
- **Score** = LLM-assigned rating (0-4 scale)
- **Threshold** = Minimum required score to pass
- **Severity** = How failures are reported (`error` or `warning`)

---

## Eval Anatomy

Every eval is a Markdown file with two parts:

```markdown
---
# YAML Frontmatter (Configuration)
id: MyEval
name: My Content Evaluator
evaluator: basic
severity: error
---

# Markdown Body (Instructions for the LLM)
Your detailed instructions for the LLM go here...
```

### File Location

Place eval files in your `prompts/` directory (or the path specified in `vectorlint.ini`):

```
project/
├── prompts/
│   ├── grammar-checker.md
│   ├── headline-evaluator.md
│   └── your-custom-eval.md
└── vectorlint.ini
```

---

## Two Types of Evals

VectorLint supports two evaluator types, each optimized for different use cases:

| Type | Use Case | Criteria | Scoring | Output |
|------|----------|----------|---------|--------|
| **Basic** | Simple pass/fail checks | Optional | Status only | ok/warning/error |
| **Advanced** | Multi-dimensional quality scoring | Required | 0-4 scale | Weighted scores |

### When to Use Each

**Use Basic Evaluator when:**
- You need a simple yes/no check (e.g., "Does it have grammar errors?")
- The evaluation is binary or has few dimensions
- You don't need fine-grained scoring

**Use Advanced Evaluator when:**
- You're measuring multiple quality dimensions
- You need weighted importance (some criteria matter more)
- You want numeric quality scores and thresholds

---

## Writing Basic Evals

Basic evals are the simplest form - perfect for straightforward checks.

### Minimal Example

```markdown
---
evaluator: basic
id: GrammarChecker
name: Grammar Checker
severity: error
---
Check this content for grammar issues, spelling errors, and punctuation mistakes.
```

### Basic Eval with Criteria

You can optionally define criteria to get structured feedback:

```markdown
---
evaluator: basic
id: HallucinationDetector
name: Hallucination Detector
severity: error
criteria:
  - name: Sweeping Claims
    id: SweepingClaims
  - name: Contradictory Instructions
    id: ContradictoryInstructions
---
Identify hallucinations in the content, including sweeping claims that are not supported by evidence and contradictory instructions that conflict with each other.
```

### How Basic Evals Work

1. **LLM analyzes content** using your instructions
2. **Returns status**: `ok`, `warning`, or `error`
3. **Optionally returns violations** grouped by criteria
4. **Reports to console** with colored output

### Basic Eval Output

The LLM response for basic evals follows this structure:

```json
{
  "status": "error",
  "message": "Grammar issues found",
  "violations": [
    {
      "analysis": "Incorrect verb tense in opening paragraph",
      "suggestion": "Change 'was running' to 'runs'",
      "criterionName": "Grammar"
    }
  ]
}
```

---

## Writing Advanced Evals

Advanced evals use weighted criteria and numeric scoring for sophisticated quality measurement.

### Structure

```markdown
---
specVersion: 1.0.0
evaluator: base-llm  # or omit (defaults to base-llm)
id: HeadlineEvaluator
name: Headline Evaluator
threshold: 16
severity: error
target:
  regex: '^#\s+(.+)$'
  flags: 'mu'
  group: 1
  required: true
  suggestion: Add an H1 headline for the article.
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

How clearly does the headline communicate what benefit the reader will gain?

### Excellent <score=4>
Specific, immediately appealing benefit

### Good <score=3>
Clear benefit but less specific impact

### Fair <score=2>
Vague but identifiable benefit

### Poor <score=1>
No clear value or very abstract benefit
```

### The 0-4 Scoring Scale

VectorLint uses a **0-4 scale** for all criteria:

| Score | Status | Meaning |
|-------|--------|---------|
| **4** | ✅ ok | Excellent - exceeds expectations |
| **3** | ✅ ok | Good - meets expectations |
| **2** | ⚠️ warning | Fair - borderline/minor issues |
| **1** | ❌ error | Poor - major issues |
| **0** | ❌ error | Fail - completely misses criteria |

**Score Calculation:**
```
Raw Score (0-4) → Weighted Score = (Raw Score ÷ 4) × Weight
```

**Example:**
- Criterion: "Value Communication" (weight=12)
- Raw Score: 3 (Good)
- Weighted Score: (3 ÷ 4) × 12 = **9/12**

### Threshold Logic

The `threshold` sets the minimum total weighted score required to pass:

```yaml
threshold: 16  # Must score at least 16/20 total
severity: error  # Violations are errors
```

**Important:** The `severity` field in frontmatter **only applies to threshold violations**, not individual criteria failures. Individual criterion severity is always determined by the 0-4 score.

### Weights: Importance Scaling

Use `weight` to indicate relative importance:

```yaml
criteria:
  - name: Critical Check
    id: CriticalCheck
    weight: 12  # Very important (60% of 20 point total)
    
  - name: Minor Check
    id: MinorCheck
    weight: 2   # Less important (10% of total)
```

**Pro Tip:** Make weights sum to a clean number (10, 20, 100) for easy threshold calculation.

---

## Target Specification

The `target` field allows you to:
1. **Specify which part** of content to evaluate (via regex)
2. **Require certain content** to exist (e.g., "must have an H1 headline")
3. **Provide helpful suggestions** when content is missing

### Basic Target

```yaml
target:
  regex: '^#\s+(.+)$'  # Match H1 headline
  flags: 'mu'          # Multiline + Unicode
  group: 1             # Capture group 1 (the headline text)
  required: true       # Content must match
  suggestion: Add an H1 headline for the article.
```

### Target Behavior

**When `required: true`:**
- If content matches → Evaluation proceeds normally
- If no match → Immediate `error` with the suggestion message

**When `required: false` or omitted:**
- If content matches → Evaluate the matched content
- If no match → Evaluate entire content

### Target at Criterion Level

You can also specify targets for individual criteria:

```yaml
criteria:
  - name: Code Quality
    id: CodeQuality
    weight: 10
    target:
      regex: '```[\s\S]+?```'  # Only evaluate code blocks
      flags: 'g'
      required: false
```

### Common Target Patterns

```yaml
# Match H1 headline
target:
  regex: '^#\s+(.+)$'
  flags: 'mu'
  group: 1

# Match all content (always matches)
target:
  regex: '[\s\S]+'
  flags: 'mu'
  group: 0

# Match code blocks
target:
  regex: '```([\s\S]+?)```'
  flags: 'g'
  group: 1

# Match introduction (first 2 paragraphs)
target:
  regex: '^(.+?\n\n.+?\n\n)'
  flags: 's'
  group: 1
```

---

## Configuration Reference

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `specVersion` | string/number | No | Eval specification version (use `1.0.0`) |
| `evaluator` | string | No | Evaluator type: `basic`, `base-llm`, `technical-accuracy` (default: `base-llm`) |
| `id` | string | **Yes** | Unique identifier (used in error reporting) |
| `name` | string | **Yes** | Human-readable name |
| `threshold` | number | No | Minimum score to pass (advanced only) |
| `severity` | string | No | `error` or `warning` (default: `error`) - applies to threshold failures |
| `target` | object | No | Content matching specification |
| `criteria` | array | **Yes*** | List of evaluation criteria (*required for advanced) |

### Criterion Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Human-readable criterion name |
| `id` | string | **Yes** | Unique identifier (PascalCase recommended) |
| `weight` | number | No | Importance weight (default: 1) |
| `target` | object | No | Criterion-specific content matching |

### Target Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regex` | string | **Yes** | Regular expression pattern |
| `flags` | string | No | Regex flags: `g` (global), `i` (case-insensitive), `m` (multiline), `u` (unicode), `s` (dotall) |
| `group` | number | No | Capture group to extract (default: 0 = full match) |
| `required` | boolean | No | If true, missing match triggers error (default: false) |
| `suggestion` | string | No | Help text when required target is missing |

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

### 2. **Use Meaningful Weights**

Scale weights to reflect real-world importance:

```yaml
criteria:
  # Technical accuracy is critical
  - name: Technical Accuracy
    weight: 40
  
  # Readability is important
  - name: Readability
    weight: 30
  
  # Style is nice-to-have
  - name: Conversational Tone
    weight: 10
```

### 3. **Provide Context in Prompts**

Help the LLM understand your domain:

```markdown
## CONTEXT BANK

**Developer Audience**: Software engineers, DevOps, QA professionals who value:
- Technical precision over marketing fluff
- Practical examples over theory
- Honest assessments over hype

**Buzzwords to Avoid**: leverage, synergy, paradigm shift, cutting-edge, revolutionary
```

### 4. **Structure Advanced Prompts**

Use clear sections for complex evals:

```markdown
## INSTRUCTION
[What to do]

## EVALUATION STEPS
[How to do it]

## CONTEXT BANK
[Background knowledge]

## RUBRIC
[Scoring criteria]

## OUTPUT FORMAT
[Expected response structure]
```

### 5. **Test Incrementally**

1. Start with one criterion
2. Test on sample content
3. Refine prompt based on results
4. Add more criteria
5. Adjust weights and thresholds

### 6. **Use Descriptive IDs**

```yaml
# Good: Clear, consistent naming
id: HeadlineEvaluator
criteria:
  - id: ValueCommunication
  - id: CuriosityGap

# Bad: Unclear, inconsistent
id: eval1
criteria:
  - id: check_A
  - id: cg
```

### 7. **Set Realistic Thresholds**

Don't expect perfection:

```yaml
# Strict (90%+ required)
threshold: 18  # out of 20

# Balanced (80%+ required)
threshold: 16  # out of 20

# Lenient (70%+ required)
threshold: 14  # out of 20
```

### 8. **Leverage Targets Wisely**

Use targets to:
- **Focus evaluation** on specific content sections
- **Enforce structure** (e.g., require headlines, code examples)
- **Skip irrelevant content** (e.g., only check prose, not code)

### 9. **Provide Evidence Markers**

Instruct the LLM to include `pre` and `post` context in violations for better location highlighting:

```markdown
For each violation, provide:
- `pre`: 10-20 characters before the issue
- `post`: 10-20 characters after the issue
- `analysis`: What's wrong
- `suggestion`: How to fix it
```

---

## Examples

### Example 1: Simple Grammar Check

```markdown
---
evaluator: basic
id: GrammarChecker
name: Grammar Checker
severity: error
---
Check this content for grammar issues, spelling errors, and punctuation mistakes.
Report any errors found with specific examples.
```

**Use case:** Quick quality gate for obvious mistakes

---

### Example 2: Headline Evaluator with Weights

```markdown
---
specVersion: 1.0.0
id: Headline
name: Headline Evaluator
threshold: 14
severity: error
target:
  regex: '^#\s+(.+)$'
  flags: 'mu'
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

### Good <score=3>
Clear benefit but less specific

### Fair <score=2>
Vague but identifiable benefit

### Poor <score=1>
No clear value

---

# Language Authenticity <weight=5>

### Excellent <score=4>
Natural, conversational language with no buzzwords

### Good <score=3>
Mostly natural with minimal promotional terms

### Fair <score=2>
Some unnatural phrasing or buzzwords

### Poor <score=1>
Heavy AI patterns or excessive buzzwords
```

**Use case:** Enforce headline quality standards before publishing

---

### Example 3: Code Example Quality

```markdown
---
specVersion: 1.0.0
id: CodeQuality
name: Code Example Quality
threshold: 12
severity: warning
criteria:
  - name: Code Presence
    id: CodePresence
    weight: 5
  - name: Code Clarity
    id: CodeClarity
    weight: 5
  - name: Code Comments
    id: CodeComments
    weight: 2
---

Evaluate the quality of code examples in this developer tutorial.

## INSTRUCTION

1. Check if code examples are present
2. Assess clarity (variable names, structure)
3. Verify helpful comments exist

## RUBRIC

# Code Presence <weight=5>

### Excellent <score=4>
Multiple relevant code examples throughout

### Good <score=3>
At least one complete code example

### Fair <score=2>
Code snippets present but incomplete

### Poor <score=1>
No code examples

---

# Code Clarity <weight=5>

### Excellent <score=4>
Clear variable names, well-structured, follows conventions

### Good <score=3>
Mostly clear with minor issues

### Fair <score=2>
Some confusing or unclear code

### Poor <score=1>
Hard to understand code

---

# Code Comments <weight=2>

### Excellent <score=4>
Helpful comments explaining complex parts

### Good <score=3>
Some useful comments

### Fair <score=2>
Minimal or unhelpful comments

### Poor <score=1>
No comments where needed
```

**Use case:** Ensure tutorial quality for developer content

---

### Example 4: AI Pattern Detector

```markdown
---
specVersion: 1.0.0
id: AIPatterns
name: AI Pattern Detector
threshold: 60
severity: warning
criteria:
  - name: Language Authenticity
    id: LanguageAuthenticity
    weight: 40
  - name: Structural Naturalness
    id: StructuralNaturalness
    weight: 30
  - name: Opening Authenticity
    id: OpeningAuthenticity
    weight: 30
---

Detect AI-generated writing patterns in this content.

## INSTRUCTION

Scan for common AI patterns:
1. **Buzzwords**: leverage, synergy, elevate, delve, explore (when overused)
2. **Formulaic transitions**: Moreover, Furthermore, Additionally
3. **Generic openings**: "In today's rapidly evolving world..."
4. **Excessive em dashes**: Overuse of — for dramatic effect

## RUBRIC

# Language Authenticity <weight=40>

Count buzzword violations:

### Excellent <score=4>
0 violations

### Good <score=3>
1-2 violations

### Fair <score=2>
3-4 violations

### Poor <score=1>
5+ violations

[Continue for other criteria...]
```

**Use case:** Detect and reduce AI-generated content patterns

---

## Troubleshooting

### Common Issues

**Issue:** Eval not running on my files
- **Check:** `vectorlint.ini` mapping configuration
- **Check:** File path patterns in `ScanPaths`

**Issue:** Threshold always failing
- **Check:** Threshold value is realistic (try lowering it)
- **Check:** Weights sum to expected value
- **Check:** LLM prompt is clear about scoring

**Issue:** Target not matching
- **Test:** Use regex101.com to validate your pattern
- **Check:** Flags (especially `m` for multiline, `s` for dotall)
- **Check:** Content actually contains the pattern

**Issue:** Inconsistent scores
- **Improve:** Make rubric more specific with concrete examples
- **Add:** Counting guidelines (e.g., "count each occurrence")
- **Provide:** Clear boundary cases in prompt

---

## Next Steps

1. **Browse existing evals** in `prompts/` for inspiration
2. **Start simple** with a basic eval
3. **Test on real content** and iterate
4. **Graduate to advanced evals** with weighted criteria
5. **Share your evals** with the community!

## Resources

- [VectorLint README](./README.md) - Installation and basic usage
- [Example Prompts](./prompts/) - Real-world eval examples
- [vectorlint.ini Reference](./vectorlint.example.ini) - Configuration options

---

**Happy evaluating! 🚀**
