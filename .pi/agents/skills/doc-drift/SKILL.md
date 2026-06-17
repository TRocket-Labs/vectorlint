---
name: doc-drift
description: Detect documentation drift in a VectorLint pull request. Given a PR diff, identifies whether existing documentation has been invalidated by code changes, or whether user-facing changes lack documentation coverage. Use when running a doc drift check on a VectorLint PR.
---

# Doc Drift Checker

You are checking a pull request in the VectorLint repository for documentation drift.

## Scope

Work only within these boundaries:
- Source changes: analyse only `src/` file changes from the diff. Ignore changes to `tests/`, `.github/`, `package.json`, `tsconfig.json`, `.vectorlint.ini`, and all non-source paths.
- Documentation: search only `docs/*.mdx` files. Do not check `README.md`, `CLAUDE.md`, or root-level markdown.

## Phase 1 — Extract behavioral changes

Read the full diff holistically before doing anything else. Your goal is to understand what changed in terms of user-visible behaviour — not which files were touched.

For each meaningful cluster of changes in the diff, write a short statement:
- What feature, flag, command, config key, or workflow changed?
- What is the before/after behaviour from a user's perspective?

Discard as noise: whitespace-only changes, test-only changes, internal refactors with no user-visible effect, comment changes, import reordering.

A PR may produce any number of distinct behavioral changes. Extract all of them — do not merge separate changes to fit a limit, and do not stop early. Treat each independently from here.

## Phase 2 — Search docs for each behavioral change

For each behavioral change, generate search terms at multiple granularities:
- **Exact names**: the precise flag name, command name, config key, or identifier as it appears in the diff
- **Concept variants**: synonyms or related terms a doc author might have used
- **Feature area**: the module or subsystem name (e.g. `provider`, `scoring`, `chunking`)

Search across `docs/` for each term set using whatever search tools are available. Find candidate files first, then read the relevant sections.

**False negative guard:** if your first set of search terms returns no results, do not immediately conclude there is no documentation. Keep trying alternative terms until additional searches consistently surface files you have already found, or until you can confidently account for all the main terminology a doc author would use for this change. Record what you searched — the output will include this as search coverage.

One behavioral change may surface multiple doc files. Collect all candidates.

## Phase 3 — Cross-reference each (behavioral change × doc candidate)

For each pair:

1. Read the section(s) of the doc that matched the search
2. Ask: does this behavioral change invalidate any claim in this section?
   - A claim is a statement about how a feature works, what a flag does, what the default is, what the output looks like, or what workflow the user should follow
   - A claim is invalidated if the code change makes it factually incorrect or materially incomplete

If yes → record a drift finding:
- Which doc file and section
- What the doc currently claims
- What is now true instead

If no → doc is still accurate. No action.

## Phase 4 — Assess coverage for behavioral changes with no doc match

For behavioral changes where Phase 2 found no candidate docs after a thorough search:

Read `references/user-facing-criteria.md`.

If the change meets the criteria for a user-facing change:
→ record an undocumented change finding:
- What changed
- Why it is user-facing
- Whether it likely belongs in an existing doc (and which one) or needs a new topic

If the change is internal only → discard it entirely. Do not mention it in the output.

## Phase 5 — Write report

Write one report file per behavioral change to the numbered paths given in the initial message (`.doc-drift-1.md`, `.doc-drift-2.md`, etc.). Each file is a self-contained comment covering one behavioral change and all doc files affected by it.

Follow the format in `references/comment.md` exactly for each file.

If there are no findings after Phases 3 and 4 → write a single `.doc-drift-1.md` containing the no-issues-found report. Do not skip writing the file.
