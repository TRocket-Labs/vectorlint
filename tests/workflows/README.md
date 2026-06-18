# Workflow Tests

This directory contains local workflow tests that are meant to be run with
`act`.

These tests exist to verify workflow behavior locally instead of using actual PRs, which are slower
and create dirty commits during iteration.

## Tests

- `docs-drift-test.yml` — Local test for the doc-drift workflow logic

## Prerequisites

1. Install `act`
2. Ensure Docker is running
3. Read the specific workflow notes below before running a test

## Persisting Test Outputs

By default, `act` runs workflows in Docker using a copied workspace. Files
created during the run may exist only inside that temporary container context
and may not appear in your local checkout after the run finishes.

Use `--bind` when you want files written by the workflow to persist in your
local working tree.

## Example `act` Command

This example runs the documentation drift workflow test locally. Check the
workflow file itself for any secrets, inputs, or branch requirements.

```bash
act workflow_dispatch \
  -W tests/workflows/docs-drift-test.yml \
  --secret-file .secrets \
  --input base_ref=main \
  --input head_ref=doc/drift-automation \
  -P ubuntu-latest=catthehacker/ubuntu:act-latest \
  --pull=false \
  --bind
```
