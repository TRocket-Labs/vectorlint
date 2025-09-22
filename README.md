# VectorLint

AI-powered content compliance automation tool for Markdown files.

## What is VectorLint?

VectorLint is a command-line tool that uses Large Language Models (LLMs) to evaluate Markdown content using prompt files you provide. It runs every markdown prompt in a directory and aggregates the raw responses.

## Features

- ✅ **AI-Powered Analysis** - Uses Azure OpenAI to check content quality
- ✅ **CLI Tool** - Run locally or in CI/CD pipelines
- ✅ **Exit Codes** - Properly exits with 0 (pass) or 1 (fail) for CI integration
- ✅ **Dependency Inversion** - Easily swap LLM providers
- ✅ **Prompt-Driven** - Put evaluation prompts in a folder; all are run
- ✅ **Aggregated Reports** - Prints raw responses per prompt for each file

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the project root (auto-loaded by the CLI):

```bash
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_TEMPERATURE=1  # optional; omit to use server default
```

You can find these values in your Azure Portal under your Azure OpenAI resource.

### Prompts

Prompts are markdown files. VectorLint loads all `.md` files from a directory and runs each one against your content. The result is an aggregated report with one section per prompt.

- Default prompts directory: `prompts/`
- Example prompt included: `prompts/headline-evaluator.md`

You can set a custom prompts directory via `vectorlint.ini` in the project root:

```
promptsPath=prompts
```

## Usage

### Local Development

```bash
# Run with tsx (no build needed)
npm run dev -- path/to/article.md

# Verbose mode (prints request summary and response text)
npm run dev -- --verbose path/to/article.md

# Show prompt and full JSON response
npm run dev -- --verbose --show-prompt --debug-json path/to/article.md

# Or make the script executable
chmod +x src/index.ts
./src/index.ts path/to/article.md
```

### Production

```bash
# Build TypeScript
npm run build

# Run built version
npm start path/to/article.md
```

### CI/CD Integration

In GitHub Actions:

```yaml
name: Content Check
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - name: Check content
        env:
          AZURE_OPENAI_API_KEY: ${{ secrets.AZURE_OPENAI_API_KEY }}
          AZURE_OPENAI_ENDPOINT: ${{ secrets.AZURE_OPENAI_ENDPOINT }}
          AZURE_OPENAI_DEPLOYMENT_NAME: ${{ secrets.AZURE_OPENAI_DEPLOYMENT_NAME }}
          AZURE_OPENAI_API_VERSION: 2024-02-15-preview
        run: npx tsx src/index.ts docs/**/*.md
        # Add --verbose to debug model responses if needed
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
npx tsx src/index.ts $(git diff --cached --name-only --diff-filter=ACM | grep '\\.md$')
```

## Example Output

```
=== File: docs/article.md ===

## Prompt: headline-evaluator.md
[raw model report here]
```

## Architecture

VectorLint uses dependency inversion to support multiple LLM providers:

```
src/
├── index.ts                 # CLI entry point
├── config/Config.ts         # Loads vectorlint.ini (promptsPath)
├── prompts/PromptLoader.ts  # Loads .md prompts from directory
└── providers/
    ├── LLMProvider.ts       # Interface (runPrompt)
    └── AzureOpenAIProvider.ts
```

## Adding New Providers

To add a new LLM provider, implement the `LLMProvider` interface:

```typescript
import { LLMProvider } from './providers/LLMProvider.js';

export class MyCustomProvider implements LLMProvider {
  async runPrompt(content: string, promptText: string): Promise<string> {
    // send promptText (with content injected) and return raw response text
    return '';
  }
}
```

## License

MIT
