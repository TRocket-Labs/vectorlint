# VectorLint Configuration Guide

A comprehensive reference for configuring VectorLint using `vectorlint.ini`.

## Configuration File

VectorLint is configured via a `vectorlint.ini` file in the root of your project. This file defines global settings, file associations, and rule overrides.

### Complete Example

```ini
# vectorlint.ini

# [Global Settings]
# Directory containing your rule packs (Required)
RulesPath=.github/rules
# Number of concurrent evaluations (Default: 4)
Concurrency=4
# Default severity for violations (Default: warning)
DefaultSeverity=warning

# [File Patterns]
# Map file patterns to rule packs and apply overrides

# All markdown files - run "Acme" rule pack
[**/*.md]
RunRules=Acme
# Override strictness for the GrammarChecker rule
GrammarChecker.strictness=7

# Technical documentation - run "Acme" pack with higher standards
[content/docs/**/*.md]
RunRules=Acme
# Higher strictness for docs
GrammarChecker.strictness=9
# Require a higher score for technical accuracy
TechnicalAccuracy.threshold=8.0

# Marketing content - run "TechCorp" pack
[content/marketing/**/*.md]
RunRules=TechCorp
BrandVoice.strictness=8

# Drafts - skip all rules
[content/drafts/**/*.md]
RunRules=
```

---

## Global Settings

These settings control the application's core behavior.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `RulesPath` | string | **Required** | Root directory containing your rule pack subdirectories. |
| `Concurrency` | integer | `4` | Number of concurrent evaluations to run. |
| `DefaultSeverity` | string | `warning` | Default severity level (`warning` or `error`) for reported issues. |

---

## LLM & Search Providers

VectorLint relies on LLM and Search providers, which are configured via environment variables in your `.env` file. Valid configurations can be found in the [.env.example](.env.example) file.

### LLM Providers
VectorLint supports multiple LLM providers. Set `LLM_PROVIDER` to your desired provider (e.g., `openai`, `anthropic`, `gemini`) and provide the corresponding API key.

### Search Provider
Some evaluators, such as **TechnicalAccuracy**, require access to current external knowledge to verify facts. VectorLint supports search providers to fetch this information.

**Example configuration for Perplexity:**
```bash
SEARCH_PROVIDER=perplexity
PERPLEXITY_API_KEY=pplx-...
```

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
└── vectorlint.ini
```

In this example, VectorLint sees two available packs: `Acme` and `TechCorp`.
*   Files in `.github/rules/Acme/` become rules in the `Acme` pack.
*   To use them, you set `RunRules=Acme` in your config.

### Order of Appearance

VectorLint processes file patterns **in the order they appear** in `vectorlint.ini`.

*   Later patterns override settings from earlier patterns.
*   If a file matches multiple sections, the **last matching section** determines the final configuration.

**Example:**

```ini
# General rule: All markdown files run "Acme"
[**/*.md]
RunRules=Acme
GrammarChecker.strictness=7

# Specific overriding rule: Docs run "Acme" with higher strictness
# This must come AFTER the general rule to take effect
[content/docs/**/*.md]
GrammarChecker.strictness=9
```

---

## Strictness Configuration

You can configure the strictness of semi-objective rules (like Grammar or AI Detection) to control how they score content. Strictness determines the penalty weight for error density.

### Syntax

```ini
[pattern]
RuleID.strictness=value
```

### Values

You can use named levels or direct numeric multipliers:

*   **1-3** or `lenient`: **~5** points penalty per 1% error density. (Drafts)
*   **4-7** or `standard`: **~10** points penalty per 1% error density. (General Content)
*   **8-10** or `strict`: **~20** points penalty per 1% error density. (Technical Docs)

**Example:**

```ini
[content/docs/**/*.md]
RunRules=Acme
GrammarChecker.strictness=strict
TechnicalAccuracy.strictness=20
```

---

## See Also

- [Creating Custom Rules](./CREATING_RULES.md)
