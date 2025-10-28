# Contributing to VectorLint

Interested in contributing to VectorLint? Great! We welcome contributions of any kind including documentation improvements, bug reports, feature requests, and pull requests.

## Table of Contents

- [Contributing to VectorLint](#contributing-to-vectorlint)
- [Table of Contents](#table-of-contents)
- [Introduction](#introduction)
- [Setting up a Development Environment](#setting-up-a-development-environment)
- [Testing](#testing)
- [Code Contribution Guidelines](#code-contribution-guidelines)
- [Git Commit Message Guidelines](#git-commit-message-guidelines)
- [Terminology](#terminology)

## Introduction

VectorLint is an LLM-based prose linter for subjective writing issues, built with TypeScript and Node.js. Unlike traditional linters that rely on pattern matching, VectorLint uses Large Language Models to evaluate content quality, enabling detection of subjective issues like clarity, tone, and technical accuracy.

The project follows strict TypeScript safety guidelines and uses schema validation at all system boundaries to ensure type safety and reliability.

## Setting up a Development Environment

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0+) - Check your version with `node --version`
- [npm](https://www.npmjs.com/) (comes with Node.js)
- Azure OpenAI access for testing LLM functionality

### Installation

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vectorlint.git
   cd vectorlint
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment:
   ```bash
   # Copy the example config files
   cp vectorlint.example.ini vectorlint.ini
   cp .env.example .env
   
   # Edit .env with your Azure OpenAI credentials
   # AZURE_OPENAI_API_KEY=your-api-key-here
   # AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
   # AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
   ```

4. Verify the setup:
   ```bash
   # Run the linter
   npm run lint
   
   # Run tests
   npm run test:run
   
   # Try the CLI
   npm run dev -- --help
   ```

## Testing

VectorLint uses [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
# Watch mode (development)
npm test

# Single run
npm run test:run

# CI with coverage
npm run test:ci
```

## Code Contribution Guidelines

### Type Safety Requirements

VectorLint follows strict TypeScript safety guidelines:

- **Never use `any`** - Use `unknown` + schema validation instead
- **Validate at boundaries** - All external data must be validated with Zod schemas
- **Enable strict TypeScript** - All strict compiler options are enabled
- **Schema-first development** - Define schemas before writing business logic

### Code Style

We use ESLint with strict rules:

```bash
# Check code style
npm run lint

# Auto-fix issues
npm run lint:fix
```

Key style requirements:
- **File naming**: Use kebab-case for files (e.g., `config-loader.ts`)
- **Variable naming**: camelCase for variables and functions
- **Type naming**: PascalCase for classes, interfaces, and types
- **Constants**: UPPER_CASE for module-level constants

### Pull Request Process

1. **Fork and branch**: Create a feature branch from `main`
2. **Make changes**: Follow the type safety and style guidelines
3. **Test thoroughly**: Ensure all tests pass and add new tests for your changes
4. **Lint your code**: Run `npm run lint` and fix any issues
5. **Commit properly**: Follow our commit message guidelines
6. **Create PR**: Provide a clear description of your changes

### Before Submitting

- [ ] All tests pass (`npm run test:run`)
- [ ] Linting passes (`npm run lint`)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] New functionality includes tests
- [ ] Documentation is updated if needed

## Git Commit Message Guidelines

We follow a modified version of the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>: <subject>

<body>

<footer>
```

### Commit Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Changes to build process, dependencies, or auxiliary tools

### Examples

```
feat: add support for Anthropic Claude provider

Implements Claude API integration with proper schema validation
and error handling. Includes configuration options for model
selection and temperature settings.

Closes #42
```

```
fix: handle missing frontmatter in prompt files

Previously crashed when prompt files lacked YAML frontmatter.
Now gracefully handles missing frontmatter with appropriate
error messages.

Fixes #38
```



## Terminology

| Term | Definition |
|:----:|:-----------|
| **Prompt** | A Markdown file with YAML frontmatter that defines evaluation criteria for content |
| **Provider** | An LLM service implementation (e.g., OpenAI, Azure OpenAI, Anthropic) |
| **Boundary** | A point where the application interfaces with external systems (files, APIs, CLI) |
| **Schema** | A Zod schema that validates external data structure and types |
| **Directive** | Configuration instructions within prompt frontmatter (weights, thresholds, etc.) |
| **Target** | A file being evaluated by VectorLint |
| **Mapping** | Rules that determine which prompts apply to which files |

---

Thank you for contributing to VectorLint! Your help makes this tool better for everyone.