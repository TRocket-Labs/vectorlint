# VectorLint [![npm version](https://img.shields.io/npm/v/vectorlint.svg)](https://www.npmjs.com/package/vectorlint) [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

VectorLint is a content review harness that turns observable quality standards into measurable feedback for agents.

VectorLint reviews content against rules that describe observable traits. It returns structured, source-grounded findings and quality scores, giving agents repeatable signals they can use to revise content and review it again.

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## Installation

### Option 1: Global Installation

Install globally from npm:

```bash
npm install -g vectorlint
```

VectorLint currently requires Node.js `20.6+`.

Verify installation:

```bash
vectorlint --help
```

### Option 2: Zero-Install with npx

Run VectorLint without installing:

```bash
npx vectorlint path/to/article.md
```

## Define Your Quality Standards

Define rules as Markdown files with YAML frontmatter. Each rule describes the observable traits that indicate content does not meet one of your standards.

Rules can identify prohibited terminology, unsupported claims, repetitive explanations, vague guidance, or other quality issues specific to your content.

VectorLint works best when each rule states what evidence counts as a finding instead of asking for a general judgment of whether the content is good.

👉 **[Learn how to create custom rules →](./CREATING_RULES.md)**

## Quality Scores

VectorLint turns review results into comparable quality signals. Agents can use those scores to measure whether revisions improve content across repeated review cycles.

For countable findings, VectorLint calculates scores from error density, or findings per 100 words. This makes results comparable across content of different lengths.

## Grounded Findings

Every reported finding includes evidence from the reviewed content. VectorLint confirms that evidence can be located in the source and omits findings that cannot be grounded there.

Adjust finding sensitivity with:

```bash
CONFIDENCE_THRESHOLD=0.75
```

- Default: `0.75`
- Lower values surface more findings (higher recall, more noise)
- Higher values surface fewer findings (higher precision, fewer false positives)

## Quick Start

### 1. Zero-Config Mode (Fastest)

If you want to review content against a single set of quality standards:

```bash
vectorlint init --quick
```

This creates a `VECTORLINT.md` file where you can define your quality standards.

> **Note:** Before running a review, set up your credentials in either `~/.vectorlint/config.toml` or a local `.env` file (see Step 3).

Then run:

```bash
vectorlint doc.md
```

### 2. Full Configuration

For a comprehensive setup (custom rule packs, specific targets), run:

```bash
vectorlint init
```

This creates:

- **VectorLint Config** (`.vectorlint.ini`): Project-specific settings.
- **App Config** (`~/.vectorlint/config.toml`): Model provider API keys.

👉 **[Full configuration reference →](./CONFIGURATION.md)**

### 3. Configure API Keys

Open your global **App Config** (`~/.vectorlint/config.toml`) and uncomment the section for your preferred model provider (OpenAI, Anthropic, Gemini, or Azure).

```toml
[env]
LLM_PROVIDER = "openai"
OPENAI_API_KEY = "sk-..."
```

> *Note: You can also use a local `.env` file in your project, which takes precedence over the global config.*

**Run a review:**

```bash
vectorlint doc.md
```

VectorLint is bundled with a `VectorLint` preset containing rules for AI pattern detection, directness, and more. The `init` command configures this automatically.

👉 **[Learn how to create custom rules →](./CREATING_RULES.md)**

### 4. Optional: Configure Langfuse observability

VectorLint can send model execution telemetry to Langfuse.

Add these environment variables to your global config or local `.env` file:

```toml
[env]
OBSERVABILITY_BACKEND = "langfuse"
LANGFUSE_PUBLIC_KEY = "pk-lf-..."
LANGFUSE_SECRET_KEY = "sk-lf-..."
# Optional for self-hosted Langfuse. Defaults to cloud.langfuse.com.
LANGFUSE_BASE_URL = "https://cloud.langfuse.com"
```

Notes:
- Observability is non-blocking. If Langfuse setup fails, VectorLint continues without telemetry.
- Prompts and outputs are recorded when Langfuse observability is enabled.
- Do not send secrets, credentials, or PII unless your policy explicitly allows observability tooling to access that data.

## Choose a Review Strategy

VectorLint chooses a review strategy automatically. The default works for most
content:

```bash
vectorlint doc.md
```

Use `--model-call` when you need to override that strategy for a particular
review. Choose `single` for normal, self-contained documents or `agent` for
large documents whose relevant context spans multiple sections.

See [Model calls](docs/model-calls.mdx) for selection guidance and examples.

## Contributing

We welcome your contributions! Whether it's adding new rules, fixing bugs, or improving documentation, please check out our [Contributing Guidelines](.github/CONTRIBUTING.md) to get started.

## Resources

- **[Creating Rules](./CREATING_RULES.md)** - Define observable quality standards in Markdown
- **[Configuration Guide](./CONFIGURATION.md)** - Complete reference for `.vectorlint.ini`
