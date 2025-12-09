# VectorLint: Prompt it, Lint it! [![npm version](https://img.shields.io/npm/v/vectorlint.svg)](https://www.npmjs.com/package/vectorlint) [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

VectorLint is a command-line tool that evaluates and scores content using LLMs. It uses [LLM-as-a-Judge](https://en.wikipedia.org/wiki/LLM-as-a-Judge) to catch content quality issues that typically require human judgement.  

![VectorLint Screenshot](./assets/VectorLint_screenshot.jpeg)

## Installation

### Option 1: Global Installation

Install globally from npm:

```bash
npm install -g vectorlint
```

Verify installation:

```bash
vectorlint --help
```

### Option 2: Zero-Install with npx

Run VectorLint without installing:

```bash
npx vectorlint path/to/article.md
```

## Enforce Your Style Guide

Define rules as Markdown files with YAML frontmatter to enforce your specific content standards:

- **Check SEO Optimization** - Verify content follows SEO best practices
- **Detect AI-Generated Content** - Identify artificial writing patterns
- **Verify Technical Accuracy** - Catch outdated or incorrect technical information
- **Ensure Tone & Voice Consistency** - Match content to appropriate tone for your audience

If you can write a prompt for it, you can lint it with VectorLint.

👉 **[Learn how to create custom rules →](./CREATING_RULES.md)**

## Quality Scores
VectorLint scores your content using error density and a rubric based system, enabling you to measure quality across documentation. This gives your team a shared understanding of which content needs attention and helps track improvements over time.
*   **Density-Based Scoring:** For errors that can be counted, scores are calculated based on **error density (errors per 100 words)**, making quality assessment fair across documents of any length.
*   **Rubric-Based Scoring:** For more subjective quality standards, like flow and completeness, scores are graded on a 1-4 rubric system and then normalized to a **1-10 scale**.

## Quick Start

1.  **Create Your First Rule:**

    Create a directory named `VectorLint` and add a file `grammar.md` inside it:

    ```markdown
    ---
    evaluator: base
    id: GrammarChecker
    description: Grammar Checker
    severity: error
    ---
    Check this content for grammar issues, spelling errors, and punctuation mistakes.
    ```

2.  **Configure VectorLint:**

    Create a `vectorlint.ini` configuration file in your project root:

    ```ini
    # vectorlint.ini
    RulesPath=.
    
    # Run the "VectorLint" rule pack on all markdown files
    [**/*.md]
    RunRules=VectorLint
    ```

    👉 **[Full configuration reference →](./CONFIGURATION.md)**

3.  **Set An LLM Provider:**

    Create a `.env` file in your project root with your API keys:

    ```bash
    # OpenAI (Default)
    OPENAI_API_KEY=sk-...
    LLM_PROVIDER=openai

    # - OR -
    
    # Anthropic
    ANTHROPIC_API_KEY=sk-ant-...
    LLM_PROVIDER=anthropic
    ```

4.  **Run a check:**

    ```bash
    vectorlint path/to/article.md
    ```

## CI/CD Integration (GitHub Actions & reviewdog)

VectorLint integrates with [reviewdog](https://github.com/reviewdog/reviewdog) via the official GitHub Action for automated PR feedback.

**Example Workflow (`.github/workflows/vectorlint.yml`):**

```yaml
name: VectorLint

on:
  pull_request:
    paths:
      - '**/*.md'
      - '**/*.mdx'
      - 'vectorlint.ini'

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run VectorLint
        uses: TRocket-Labs/vectorlint-action@v1
        with:
          llm_provider: ${{ secrets.LLM_PROVIDER }}
          # Add your provider credentials via GitHub Secrets
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          # Reviewdog options
          reporter: github-pr-review
          filter_mode: added
          fail_on_error: false
```
**Reviewdog Reporter Options:**
- `github-pr-review`: Posts inline comments on specific lines in the PR diff.
- `github-pr-check`: Creates annotations in the "Checks" tab.


## Contributing

We welcome your contributions! Whether it's adding new rules, fixing bugs, or improving documentation, please check out our [Contributing Guidelines](.github/CONTRIBUTING.md) to get started.

## Resources

- **[Creating Custom Rules](./CREATING_RULES.md)** - Write your own quality checks in Markdown
- **[Configuration Guide](./CONFIGURATION.md)** - Complete reference for `vectorlint.ini`
