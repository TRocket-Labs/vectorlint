# Release Docs Workflow Runbook

## One-Time Setup

1. In Mintlify Git settings, set the deployment branch to `release-docs`.
2. In GitHub Actions repository settings, allow workflows to create pull requests.
3. Add branch protection rules for `main` and `release-docs`.

## Branch Protection Rules

- Require pull requests before merge on `main`
- Require pull requests before merge on `release-docs`
- Prevent force pushes on both branches
- Require at least one reviewer on `release-docs`

## Public Docs Hotfix Flow

1. Open a PR against `release-docs`.
2. Merge after review.
3. Confirm the sync workflow opened or updated the `release-docs -> main` PR.

## Release Promotion Flow

1. Open a PR from `main` into `release-docs`.
2. Review only for latest released behavior.
3. Merge and confirm Mintlify deploys from `release-docs`.
