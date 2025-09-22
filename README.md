# VectorLint

AI-powered content compliance automation tool for Markdown files.

## What is VectorLint?

VectorLint is a command-line tool that uses Large Language Models (LLMs) to automatically review and validate Markdown content against quality standards. It works like ESLint or Vale, but uses AI for intelligent, context-aware feedback.

## Features

- ✅ **AI-Powered Analysis** - Uses Azure OpenAI to check content quality
- ✅ **CLI Tool** - Run locally or in CI/CD pipelines
- ✅ **Exit Codes** - Properly exits with 0 (pass) or 1 (fail) for CI integration
- ✅ **Dependency Inversion** - Easily swap LLM providers
- ✅ **Vale-like Output** - Familiar formatting with file paths, line numbers, and severity levels

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

## Usage

### Local Development

```bash
# Run with tsx (no build needed)
npm run dev -- path/to/article.md

# Verbose mode (prints model response text)
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

```bash
$ vectorlint docs/article.md

docs/article.md
  12:5   error    Grammar error: Subject-verb agreement    grammar
  23:1   warning  Consider using active voice              grammar

❌ 1 error, 1 warning
```

## Architecture

VectorLint uses dependency inversion to support multiple LLM providers:

```
src/
├── index.ts              # CLI entry point
├── providers/
│   ├── LLMProvider.ts    # Interface
│   └── AzureOpenAIProvider.ts
├── analyzer/
│   ├── ContentAnalyzer.ts
│   └── types.ts
└── output/
    └── Formatter.ts
```

## Adding New Providers

To add a new LLM provider, implement the `LLMProvider` interface:

```typescript
import { LLMProvider } from './providers/LLMProvider.js';

export class MyCustomProvider implements LLMProvider {
  async analyze(content: string): Promise<AnalysisResult> {
    // Your implementation
  }
}
```

## License

MIT
