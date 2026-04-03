# VectorLint Configuration Guide

A comprehensive reference for configuring VectorLint using`.vectorlint.ini`.

## Configuration File

VectorLint is configured via a `.vectorlint.ini` file in the root of your project. This file defines global settings, file associations, and rule overrides.

### Complete Example

```ini
# .vectorlint.ini

# [Global Settings]
# Optional: Path to custom rules directory
# If omitted, only preset rules (from RunRules) are used
# RulesPath=.github/rules
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

| Setting           | Type    | Default      | Description                                                        |
| ----------------- | ------- | ------------ | ------------------------------------------------------------------ |
| `RulesPath`       | string  | (none)       | Root directory for custom rule packs. If omitted, only presets are used. |
| `Concurrency`     | integer | `4`          | Number of concurrent evaluations to run.                           |
| `DefaultSeverity` | string  | `warning`    | Default severity level (`warning` or `error`) for reported issues. |

---

## Global Style Guide (VECTORLINT.md)

You can place a `VECTORLINT.md` file in your project root to define global style instructions.

### Zero-Config Mode
If no `.vectorlint.ini` exists, VectorLint will automatically:
1. Detect `VECTORLINT.md`
2. Create a synthetic "Style Guide Compliance" rule
3. Evaluate your contents against it

### Combined Mode
If you have configured rules (via `.vectorlint.ini`), the content of `VECTORLINT.md` is **prepended** to the system prompt for every evaluation. This ensures your global style preferences (tone, terminology) are respected across all specific rules.

> **Note:** Keep `VECTORLINT.md` concise. VectorLint will emit a warning if the file exceeds ~4,000 tokens, as very large contexts can degrade performance and increase costs.

---

## LLM & Search Providers

VectorLint relies on LLM and Search providers. These are configured globally in `~/.vectorlint/config.toml`, or project scope using a `.env` file (which takes precedence).

You can generate these files using the `vectorlint init` command.

### LLM Providers

VectorLint supports multiple LLM providers. Set `LLM_PROVIDER` to your desired provider (e.g., `openai`, `anthropic`, `gemini`) and provide the corresponding API key.

Each provider can also define optional capability-tier overrides for agent mode. Use the provider-specific field names for the active provider:

- OpenAI: `OPENAI_HIGH_CAPABILITY_MODEL`, `OPENAI_MID_CAPABILITY_MODEL`, `OPENAI_LOW_CAPABILITY_MODEL`
- Azure OpenAI: `AZURE_OPENAI_HIGH_CAPABILITY_DEPLOYMENT_NAME`, `AZURE_OPENAI_MID_CAPABILITY_DEPLOYMENT_NAME`, `AZURE_OPENAI_LOW_CAPABILITY_DEPLOYMENT_NAME`
- Anthropic: `ANTHROPIC_HIGH_CAPABILITY_MODEL`, `ANTHROPIC_MID_CAPABILITY_MODEL`, `ANTHROPIC_LOW_CAPABILITY_MODEL`
- Gemini: `GEMINI_HIGH_CAPABILITY_MODEL`, `GEMINI_MID_CAPABILITY_MODEL`, `GEMINI_LOW_CAPABILITY_MODEL`
- Bedrock: `BEDROCK_HIGH_CAPABILITY_MODEL`, `BEDROCK_MID_CAPABILITY_MODEL`, `BEDROCK_LOW_CAPABILITY_MODEL`

Capability fallback is upward-only inside the active provider:

- `low-capability` falls back to `mid-capability`, then `high-capability`, then the provider default
- `mid-capability` falls back to `high-capability`, then the provider default
- `high-capability` falls back to the provider default

Agent mode uses those tiers with these defaults:

- the top-level review loop resolves `high-capability`
- bundled `lint` requests resolve `mid-capability`
- delegated sub-agents default to `high-capability` when the `agent` tool omits `model`

### Search Provider

Some evaluators, such as **TechnicalAccuracy**, require access to current external knowledge to verify facts. VectorLint supports search providers to fetch this information.

**Example configuration for Perplexity:**

```bash
SEARCH_PROVIDER=perplexity
PERPLEXITY_API_KEY=pplx-...
```

### False-Positive Filtering (PAT)

VectorLint uses PAT (Pay A Tax) style gate checks to reduce false positives. The model may return many raw candidates, but only candidates that pass deterministic gate checks are surfaced in CLI output.

You can tune the confidence gate with an environment variable:

```bash
CONFIDENCE_THRESHOLD=0.75
```

- Default: `0.75`
- Applies to surfaced violations in check and judge evaluations
- Invalid values gracefully fall back to the default

---

## Agent-Mode Tooling

When you run `vectorlint ... --mode agent`, the runtime precomputes matched rule units for each target file before the agent loop starts. That keeps the loop grounded in the exact file-to-rule pairs selected by your config.

The agent-mode tools behave like this:

- `lint` accepts one file and an explicit `rules[]` array of source-backed rule calls
- `reviewInstruction` replaces the bundled member rule body for that call
- `context` is appended under `Required context for this review:`
- the runtime executes one bundled review request per `lint` tool call and preserves `ruleSource` attribution for every finding
- the `agent` tool runs bounded read-only delegated work in isolated context and returns a compact sub-agent result

The delegated sub-agent can only use read-only workspace tools. It cannot write files, call `lint`, recurse into another `agent` call, or finalize the main review session.

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

### Order of Appearance

## Cascading Configuration

VectorLint uses a **"Cascading"** logic (similar to Vale.sh) to determine which configuration applies to a file.

1.  **General to Specific**: All configuration blocks that match a file are applied, starting with general patterns and ending with specific ones.
2.  **What happens**:
    - **Rule Packs**: A file runs rules from all matching patterns.
    - **Settings**: More specific patterns override general ones.
3.  **Specificity**:
    - **General**: Patterns with fewer path segments or more wildcards (e.g., `*.md`).
    - **Specific**: Patterns with more path segments or exact names (e.g., `content/docs/api.md`).

### Example

```ini
# General (Applied FIRST)
[**/*.md]
RunRules=GeneralRules
Grammar.strictness=5

# Specific (Applied SECOND, overrides General)
# MATCHES: content/docs/api.md
# RESULT: Runs "GeneralRules" AND "TechDocs". strictness is 9 (overrides 5).
[content/docs/**/*.md]
RunRules=TechDocs
Grammar.strictness=9
```

You can configure the strictness of check rules (like Grammar or AI Detection) to control how they score content. Strictness determines the penalty weight for error density.

### Syntax

```ini
[pattern]
RuleID.strictness=value
```

### Values

You can use named levels or direct numeric multipliers:

- **1-3** or `lenient`: **~5** points penalty per 1% error density. (Drafts)
- **4-7** or `standard`: **~10** points penalty per 1% error density. (General Content)
- **8-10** or `strict`: **~20** points penalty per 1% error density. (Technical Docs)

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
