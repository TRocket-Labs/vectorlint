# VectorLint Action

Run [VectorLint](https://github.com/TRocket-Labs/vectorlint) with [reviewdog](https://github.com/reviewdog/reviewdog) on pull requests to automatically review content quality using LLMs.

## Features

- 🤖 **LLM-Powered Reviews**: Catch subjective issues like clarity, tone, and technical accuracy
- 💬 **Inline PR Comments**: Get feedback directly on the lines that need improvement
- ✅ **GitHub Checks Integration**: See all issues in the "Checks" tab
- 🎯 **Configurable**: Customize prompts, rules, and severity levels
- 🚀 **Easy Setup**: Works with OpenAI or Anthropic APIs

## Usage

### Basic Setup

```yaml
name: VectorLint

on:
  pull_request:
    paths:
      - '**/*.md'
      - '**/*.mdx'

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  vectorlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run VectorLint
        uses: TRocket-Labs/vectorlint-action@v1
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run VectorLint
  uses: TRocket-Labs/vectorlint-action@v1
  with:
    # API Keys (provide one)
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    # anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    
    # Reporter type
    reporter: github-pr-check  # or github-pr-review, github-check
    
    # Filter mode
    filter_mode: added  # or diff_context, file, nofilter
    
    # Fail on errors
    fail_on_error: true
    
    # Additional vectorlint flags
    vectorlint_flags: '--verbose'
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `github_token` | GitHub token for reviewdog | No | `${{ github.token }}` |
| `openai_api_key` | OpenAI API key | No* | - |
| `anthropic_api_key` | Anthropic API key | No* | - |
| `reporter` | Reporter type | No | `github-pr-check` |
| `filter_mode` | Filter mode | No | `added` |
| `fail_on_error` | Fail if errors are found | No | `true` |
| `vectorlint_flags` | Additional vectorlint flags | No | `` |
| `working_directory` | Working directory | No | `.` |

*At least one API key must be provided.

## Reporter Types

- **`github-pr-check`**: Creates a check run with annotations (recommended)
- **`github-pr-review`**: Posts review comments on the PR
- **`github-check`**: Creates a check run without annotations

## Filter Modes

- **`added`**: Only check lines added in the PR (default)
- **`diff_context`**: Check lines in the diff context
- **`file`**: Check entire files that were changed
- **`nofilter`**: Check all files

## Configuration

Create a `vectorlint.ini` file in your repository root:

```ini
PromptsPath = prompts
ScanPaths = ["content/**/*.md", "docs/**/*.md"]
```

And add prompts in the `prompts/` directory. See [VectorLint documentation](https://github.com/TRocket-Labs/vectorlint) for details.

## Example Projects

- [TRocket-Labs/vectorlint](https://github.com/TRocket-Labs/vectorlint) - Uses this action for self-testing

## License

MIT

## Links

- [VectorLint Repository](https://github.com/TRocket-Labs/vectorlint)
- [Reviewdog](https://github.com/reviewdog/reviewdog)
