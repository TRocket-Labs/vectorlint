# VectorLint

A command-line tool that evaluates Markdown content using LLMs and provides quality scores. Think of it like [Vale](https://github.com/errata-ai/vale), but instead of pattern matching, it uses LLMs enabling you to catch subjective issues like clarity, tone, and technical accuracy.

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## Features

- **LLM-based** - Uses LLMs to check content quality
- **CLI Support** - Run locally or in CI/CD pipelines
- **Consistent Evaluations** - Write structured evaluation prompts to get consistent evaluation results
- **Quality Scores & Thresholds** - Set scores and thresholds for your quality standards

## Quick Start

Get up and running in minutes.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/TinyRocketLabs/vectorlint.git
    cd vectorlint
    ```

2.  **Install dependencies & Build:**

    ```bash
    npm install
    npm run build
    ```

3.  **Configure Environment:**

    ```bash
    cp .env.example .env
    # Edit .env with your API key (e.g., OPENAI_API_KEY)
    ```

4.  **Run a check:**

    ```bash
    # Run against a local file
    npm run dev -- path/to/article.md
    ```

## Global Installation (Recommended)

To run `vectorlint` from anywhere on your machine, use `npm link`.

1.  **Build and Link:**

    ```bash
    # Inside the vectorlint directory
    npm run build
    npm link
    ```

2.  **Verify Installation:**

    ```bash
    vectorlint --help
    ```

3.  **Usage:**

    Now you can run `vectorlint` in any project:

    ```bash
    vectorlint my-article.md
    ```

## Configuration

### LLM Provider

VectorLint supports OpenAI, Azure OpenAI, Anthropic, and Perplexity.

**Minimal Setup (OpenAI):**

1.  Copy `.env.example` to `.env`.
2.  Set `LLM_PROVIDER=openai`.
3.  Set `OPENAI_API_KEY=your-key`.

For other providers (Azure, Anthropic), see the comments in `.env.example`.

### Project Config (vectorlint.ini)

To customize which prompts run on which files, use a `vectorlint.ini` file in your project root.

```bash
cp vectorlint.example.ini vectorlint.ini
```

**Key Settings:**
- `PromptsPath`: Directory containing your `.md` prompts.
- `ScanPaths`: Glob patterns for files to scan (e.g., `[content/**/*.md]`).

## Usage Guide

### Running Locally

```bash
# Basic usage (if linked globally)
vectorlint path/to/article.md

# Using npm script (if not linked)
npm run dev -- path/to/article.md

# Debug mode (shows prompts and full JSON response)
vectorlint --verbose --show-prompt --debug-json path/to/article.md
```

### Creating Prompts

Prompts are simple Markdown files with YAML frontmatter.

**Example (`prompts/grammar.md`):**

```markdown
---
evaluator: basic
id: GrammarChecker
name: Grammar Checker
---
Check the content for grammar issues and ensure professional writing quality.
```

## Testing

- `npm test`: Run tests in watch mode
- `npm run test:run`: Single run
- `npm run test:ci`: CI run with coverage

Tests live under `tests/` and use Vitest. They validate config parsing (PromptsPath, ScanPaths), file discovery (including prompts exclusion), prompt/file mapping, and prompt aggregation with a mocked provider.