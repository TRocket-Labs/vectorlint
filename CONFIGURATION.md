# VectorLint Configuration Guide

A comprehensive reference for configuring VectorLint using`.vectorlint.ini`.

## Configuration File

VectorLint is configured via a `.vectorlint.ini` file in the root of your project. This file defines global settings and maps file patterns to rule packs.

### Complete Example

```ini
# .vectorlint.ini

# [Global Settings]
# Optional: Path to custom rules directory
# If omitted, only preset rules (from RunRules) are used
# RulesPath=.github/rules
# Number of concurrent reviews (Default: 4)
Concurrency=4
# Default severity for violations (Default: warning)
DefaultSeverity=warning

# [File Patterns]
# Map file patterns to rule packs

# All markdown files - run "Acme" rule pack
[**/*.md]
RunRules=Acme

# Technical documentation - run "Acme" pack
[content/docs/**/*.md]
RunRules=Acme

# Marketing content - run "TechCorp" pack
[content/marketing/**/*.md]
RunRules=TechCorp

# Drafts - skip all rules
[content/drafts/**/*.md]
RunRules=
```

---

## Global Settings

These settings control the application's core behavior.

| Setting           | Type    | Default      | Description                                                        |
| ----------------- | ------- | ------------ | ------------------------------------------------------------------ |
| `RulesPath`       | string  | (none)       | Root directory for custom rule packs. If omitted, only presets are used. |
| `Concurrency`     | integer | `4`          | Number of concurrent reviews to run.                              |
| `DefaultSeverity` | string  | `warning`    | Default severity level (`warning` or `error`) for reported issues. |

---

## Global Style Guide (VECTORLINT.md)

You can place a `VECTORLINT.md` file in your project root to define global style instructions.

### Zero-Config Mode
If no `.vectorlint.ini` exists, VectorLint will automatically:
1. Detect `VECTORLINT.md`
2. Create a synthetic "Style Guide Compliance" rule
3. Review your content against it

### Combined Mode
If you have configured rules (via `.vectorlint.ini`), the content of `VECTORLINT.md` is **applied globally** to every review. This ensures your global style preferences (tone, terminology) are respected across all specific rules.

> **Note:** Keep `VECTORLINT.md` concise. VectorLint will emit a warning if the file exceeds ~4,000 tokens, as very large contexts can degrade performance and increase costs.

---

## LLM & Search Providers

VectorLint relies on LLM and Search providers. These are configured globally in `~/.vectorlint/config.toml`, or project scope using a `.env` file (which takes precedence).

You can generate these files using the `vectorlint init` command.

### LLM Providers

VectorLint supports multiple LLM providers. Set `LLM_PROVIDER` to your desired provider (`openai`, `anthropic`, `azure-openai`, `gemini`, or `amazon-bedrock`) and provide the corresponding API key.

### Search Provider

Some evaluators, such as **TechnicalAccuracy**, require access to current external knowledge to verify facts. VectorLint supports search providers to fetch this information.

**Example configuration for Perplexity:**

```bash
SEARCH_PROVIDER=perplexity
PERPLEXITY_API_KEY=pplx-...
```

### False-Positive Filtering

VectorLint filters raw model output through confidence checks to reduce false positives. The model may return many raw candidates, but only candidates that pass the confidence checks are surfaced in CLI output.

You can tune the confidence gate with an environment variable:

```bash
CONFIDENCE_THRESHOLD=0.75
```

- Default: `0.75`
- Applies to surfaced violations in all reviews
- Invalid values gracefully fall back to the default

---

## File Pattern Sections

VectorLint uses `[glob/pattern]` sections to map specific files to rule packs.

### Syntax

```ini
[glob/pattern]
RunRules=PackName, AnotherPack
```

- **Pattern**: A standard glob pattern (e.g., `**/*.md`, `content/docs/**/*.md`).
- **RunRules**: A comma-separated list of rule pack names to run on matching files.
  - Use company names (e.g., `Acme`, `TechCorp`) if your rules are organized that way.
  - Leave empty (`RunRules=`) to explicitly skip rules for these files.

### Directory Structure

The `RulesPath` setting defines the root directory where VectorLint looks for rule packs. The subdirectories inside `RulesPath` become the available "PackNames".

**Example Layout:**

```
project/
├── .github/rules/           ← Configured as RulesPath
│   ├── Acme/                ← Rule Pack: "Acme"
│   │   ├── grammar.md
│   │   └── style.md
│   └── TechCorp/            ← Rule Pack: "TechCorp"
│       └── brand.md
└── .vectorlint.ini
```

In this example, VectorLint sees two available packs: `Acme` and `TechCorp`.

- Files in `.github/rules/Acme/` become rules in the `Acme` pack.
- To use them, you set `RunRules=Acme` in your config.

## Cascading Configuration

VectorLint uses a **"Cascading"** logic (similar to Vale.sh) to determine which configuration applies to a file.

1.  **General to Specific**: All configuration blocks that match a file are applied, starting with general patterns and ending with specific ones.
2.  **What happens**: Rule packs accumulate. A file runs rules from all matching patterns, applied from general to specific.
3.  **Specificity**:
    - **General**: Patterns with fewer path segments or more wildcards (e.g., `*.md`).
    - **Specific**: Patterns with more path segments or exact names (e.g., `content/docs/api.md`).

### Example

```ini
# General (Applied FIRST)
[**/*.md]
RunRules=GeneralRules

# Specific (Applied SECOND, rule packs accumulate)
# MATCHES: content/docs/api.md
# RESULT: Runs "GeneralRules" AND "TechDocs"
[content/docs/**/*.md]
RunRules=TechDocs
```

Strictness is not configured in `.vectorlint.ini`. It is a per-rule setting defined in each rule's YAML frontmatter. See [Creating Custom Rules](./CREATING_RULES.md) for the available levels (`lenient` = 5, `standard` = 10, `strict` = 20).

---

## See Also

- [Creating Custom Rules](./CREATING_RULES.md)
