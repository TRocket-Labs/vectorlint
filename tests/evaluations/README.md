# Manual Evaluations

This directory contains test fixtures for running VectorLint manually against real LLM providers. Use it to evaluate accuracy, compare models, and inspect gate check behavior.

## Contents

```
tests/evaluations/
├── .vectorlint.ini          # Config pointing at test-rules/
├── TEST_FILE.md             # Sample document to evaluate
└── test-rules/
    └── Test/                # Rule pack with general-purpose test rules
        ├── clarity.md
        ├── consistency.md
        ├── passive-voice.md
        ├── readability.md
        └── wordiness.md
```

## Running an evaluation

From the repo root:

```bash
# Basic run
npm run dev -- tests/evaluations/TEST_FILE.md \
  --config tests/evaluations/.vectorlint.ini

# With debug artifacts (writes raw model output + gate check decisions)
npm run dev -- tests/evaluations/TEST_FILE.md \
  --config tests/evaluations/.vectorlint.ini \
  --debug-json

# With verbose output
npm run dev -- tests/evaluations/TEST_FILE.md \
  --config tests/evaluations/.vectorlint.ini \
  --debug-json --verbose
```

Debug artifacts are written to `.vectorlint/runs/<model-tag>/<run_id>.json` and are gitignored.

## Switching models

Set your provider and model via environment variables before running:

```bash
# OpenAI
LLM_PROVIDER=openai OPENAI_MODEL=gpt-4o npm run dev -- ...

# Anthropic
LLM_PROVIDER=anthropic ANTHROPIC_MODEL=claude-sonnet-4-6 npm run dev -- ...

# Gemini
LLM_PROVIDER=gemini GEMINI_MODEL=gemini-1.5-pro npm run dev -- ...
```

Or configure them in `~/.vectorlint/config.toml`.

## Inspecting debug artifacts

Each artifact under `.vectorlint/runs/` contains:

- `raw_model_output` — exact JSON returned by the model, including all gate check fields
- `filter_decisions` — deterministic surface/hide decision per violation candidate with reasons
- `surfaced_violations` — candidates that passed all gates

Use these to compare how different models respond to the same rules and content, and to tune gate check thresholds.
