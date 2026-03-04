# CLI reference

This reference documents all available commands, flags, and behaviors for the vectorlint CLI.

## Installation

Install the CLI globally via npm:

```bash
npm install -g vectorlint
```

Verify the installation:

```bash
vectorlint --version
```

## Running a scan

Point the CLI at a file or directory:

```bash
vectorlint ./docs
vectorlint README.md
```

By default, results are printed to stdout. Use `--output=json` for structured output.

## Configuration file

The CLI looks for `.vectorlint.ini` in the current directory unless you specify `--config`. The configuration file controls which rules run and which file patterns they apply to.

Paths in the config file are resolved relative to the config file's location, not the working directory.

## Using presets

Presets bundle a curated set of rules into a named package. To use a preset, reference it in your config:

```ini
[**/*.md]
RunRules = Style
```

Run `vectorlint validate` to check whether your configuration is valid before running a full scan.

## Flags

| Flag | Description |
|---|---|
| `--config` | Path to a custom config file |
| `--output` | Output format: line, json, vale-json, rdjson |
| `--verbose` | Enable verbose logging |
| `--debug-json` | Write raw model output to disk |
