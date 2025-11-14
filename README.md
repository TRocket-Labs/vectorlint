# VectorLint
A command-line tool that evaluates Markdown content using LLMs and provides quality scores. Think of it like [Vale](https://github.com/errata-ai/vale), but instead of pattern matching, it uses LLMs enabling you to catch subjective issues like clarity, tone, and technical accuracy.

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## Features

- **LLM-based** - Uses LLMs to check content quality
- **Real-time Verification** - Technical accuracy evaluator uses search APIs to verify factual claims
- **CLI Support** - Run locally or in CI/CD pipelines
- **Consistent Evaluations** - Write structured evaluation prompts to get consistent evaluation results
- **Quality Scores & Thresholds** - Set scores and thresholds for your quality standards

## Installation

Install dependencies:

```bash
npm install
```

## LLM Provider Configuration

VectorLint supports multiple LLM providers. Choose and configure your preferred provider using environment variables.

### Setup

Copy the example environment file and configure your API credentials:

```bash
cp .env.example .env
# Edit .env with your actual API credentials
```

### Azure OpenAI

Configure Azure OpenAI in your `.env` file:

```bash
# Azure OpenAI Configuration
LLM_PROVIDER=azure-openai
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_TEMPERATURE=0.2
```

### Anthropic Claude

Configure Anthropic in your `.env` file:

```bash
# Anthropic Configuration
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key-here
ANTHROPIC_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_TEMPERATURE=0.2
```

### Perplexity Search (Optional)

VectorLint supports real-time fact verification through the Perplexity API. This enables the technical accuracy evaluator to verify claims against current information.

Get your API key from [Perplexity Settings](https://www.perplexity.ai/settings/api), then configure in your `.env` file:

```bash
# Perplexity Configuration (optional - required for technical-accuracy evaluator)
PERPLEXITY_API_KEY=pplx-your-api-key-here
```

**Note:** If `PERPLEXITY_API_KEY` is not set, prompts using `evaluator: technical-accuracy` will fail. Standard LLM-based prompts (`evaluator: base-llm`) work without it.


### Temperature Recommendations

For consistent evaluation results, it's recommended to use relatively low temperature values (0.1-0.3) to reduce randomness in model responses. This helps ensure more predictable and reproducible quality assessments.

### Project Config (vectorlint.ini)

Copy the sample and edit for your project:

```bash
cp vectorlint.example.ini vectorlint.ini
```

Keys (PascalCase):
- `PromptsPath`: directory containing your `.md` prompts
- `ScanPaths`: bracketed list of file patterns to scan (supports only `.md` and `.txt`)

Example (vectorlint.example.ini):

```
PromptsPath=prompts
ScanPaths=[*.md]
Concurrency=4
```

Note: `vectorlint.ini` is git-ignored; commit `vectorlint.example.ini` as the template.

### Prompts

Prompts are markdown files. VectorLint loads all `.md` files from `PromptsPath` and runs each one against your content. The result is an aggregated report with one section per prompt.

- Prompts do not need a placeholder; the file content is injected automatically as a separate message
- Prompts start with a YAML frontmatter block that defines the evaluation criteria (names, weights, and optional thresholds/severities). Keep the body human‑readable
- VectorLint enforces a structured JSON response via the API and parses scores automatically - you don't need to specify output format in your prompts

#### Evaluator Types

VectorLint supports two evaluator types, specified in the prompt frontmatter:

**`evaluator: base-llm` (default)**
- Standard LLM-based evaluation using the model's training data
- No external dependencies required
- Best for subjective quality checks (clarity, tone, style)

**`evaluator: technical-accuracy`**
- Uses real-time search to verify factual claims
- Requires `PERPLEXITY_API_KEY` environment variable
- Best for verifying technical facts, API behaviors, version info, etc.

Example frontmatter:

```yaml
---
specVersion: 1.0.0
evaluator: technical-accuracy  # or base-llm (default)
threshold: 20
severity: error
name: Technical Accuracy
id: TechnicalAccuracy
criteria:
  - name: Technical Accuracy
    id: TechnicalAccuracy
    weight: 20
    severity: error
---
```

See `prompts/hallucination-detector.md` for a complete technical accuracy example.

## Technical Accuracy Evaluator

The technical accuracy evaluator verifies factual claims in your content using real-time search. This is useful for catching:

- Outdated API behaviors or features
- Incorrect version numbers or release dates
- Fabricated tool names or libraries
- Unsupported technical claims

### How It Works

1. **Extract Claims** - LLM identifies factual, statistical, and technical claims in your content
2. **Generate Queries** - LLM creates optimized search queries for each claim
3. **Search** - Perplexity API finds current, authoritative information
4. **Evaluate** - LLM assesses accuracy by comparing claims against search results
5. **Report** - Violations include line numbers, analysis, and suggestions

### Example

Given content claiming "React 19 was released in 2023", the evaluator:
- Extracts the claim
- Searches for "React 19 release date"
- Finds that React 19 was released in 2024
- Reports a violation with the correct information

### Setup

1. Get a Perplexity API key from https://www.perplexity.ai/settings/api
2. Add to `.env`: `PERPLEXITY_API_KEY=pplx-your-key`
3. Create a prompt with `evaluator: technical-accuracy`
4. Run VectorLint on your content

## Usage

### Local Development

Run VectorLint without building:

```bash
# Basic usage
npm run dev -- path/to/article.md

# See what's being sent to the LLM
npm run dev -- --verbose path/to/article.md

# Debug mode: show prompt and full JSON response
npm run dev -- --verbose --show-prompt --debug-json path/to/article.md
```

Or make the script executable:

```bash
chmod +x src/index.ts
./src/index.ts path/to/article.md
```

## Prompt Mapping (INI)

Control which prompts apply to which files using INI sections. Precedence: `Prompt:<Id>` → `Directory:<Alias>` → `Defaults`. Excludes are unioned and win over includes.

Example:

```
[Prompts]
paths = ["Default:prompts", "Blog:prompts/blog"]

[Defaults]
include = ["**/*.md"]
exclude = ["archived/**"]

[Directory:Blog]
include = ["content/blog/**/*.md"]
exclude = ["content/blog/drafts/**"]

[Prompt:Headline]
include = ["content/blog/**/*.md"]
exclude = ["content/blog/drafts/**"]
```

Notes:
- Aliases in `[Prompts].paths` tie a prompt's folder to a logical name
- The CLI derives a prompt's alias from its actual file path and applies the mapping per scanned file

## Testing

- Run in watch mode (local dev): `npm test`
- Single run (no watch): `npm run test:run`
- CI with coverage: `npm run test:ci`

Tests live under `tests/` and use Vitest. They validate config parsing (PromptsPath, ScanPaths), file discovery (including prompts exclusion), prompt/file mapping, and prompt aggregation with a mocked provider.