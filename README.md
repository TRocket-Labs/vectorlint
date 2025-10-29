# VectorLint
A command-line tool that evaluates Markdown content using LLMs and provides quality scores. Think of it like [Vale](https://github.com/errata-ai/vale), but instead of pattern matching, it uses LLMs enabling you to catch subjective issues like clarity, tone, and technical accuracy.

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## Features

- **LLM-based** - Uses LLMs to check content quality
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

#### Anthropic Model Options

- `claude-3-sonnet-20240229` (default) - Balanced performance and cost
- `claude-3-haiku-20240307` - Fastest and most cost-effective
- `claude-3-opus-20240229` - Most capable for complex tasks

#### Anthropic Configuration Parameters

- `ANTHROPIC_API_KEY` (required) - Your Anthropic API key
- `ANTHROPIC_MODEL` (optional) - Model to use (default: claude-3-sonnet-20240229)
- `ANTHROPIC_MAX_TOKENS` (optional) - Maximum tokens in response (default: 4096)
- `ANTHROPIC_TEMPERATURE` (optional) - Controls randomness, 0-1 (default: 0.2)

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