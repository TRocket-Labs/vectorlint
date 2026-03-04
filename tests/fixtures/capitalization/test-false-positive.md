# Getting started with the CLI

This guide covers installation, configuration, and basic usage of the command-line interface.

## Installing the CLI

Download the latest release from the releases page and add it to your PATH:

```bash
export PATH="$PATH:/usr/local/bin/vectorlint"
```

Alternatively, install via npm:

```bash
npm install -g vectorlint
```

## Authenticating with GitHub

The CLI integrates with GitHub to pull configuration from your repository. Run the following to authenticate:

```bash
vectorlint auth login
```

You'll be prompted to open a browser window and authorize the application. macOS Keychain is used to store credentials securely.

## Configuring your project

Create a `.vectorlint.ini` file at the root of your project. This file controls which rules run and which files are scanned.

Example configuration:

```ini
RulesPath = ./rules

[**/*.md]
RunRules = Style
```

## Setting up PostgreSQL

If your workflow requires a database backend, install PostgreSQL and create a database for the application:

```bash
createdb vectorlint_dev
```

Export the connection string before running the CLI:

```bash
export DATABASE_URL=postgres://localhost:5432/vectorlint_dev
```

## Running your first scan

Point the CLI at a directory or individual file:

```bash
vectorlint ./docs
```

Results are printed to stdout by default.

## Interpreting the output

Each finding includes a severity level (`warning` or `error`), the file path, and a short description of the issue. Use `--output=json` to get machine-readable output suitable for CI pipelines.

## Updating the CLI

Check for updates with:

```bash
vectorlint --version
```

If a new version is available, reinstall via npm or download the updated binary. Breaking changes are documented in the changelog on GitHub.
