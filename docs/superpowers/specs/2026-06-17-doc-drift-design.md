# Doc Drift Checker - Design Spec

**Date:** 2026-06-17
**Status:** Approved for implementation
**Scope:** VectorLint repository only

---

## 1. Overview

When code changes, documentation can silently become false. A flag gets renamed, a default changes, a workflow shifts - and the docs still describe the old behaviour. This system detects that gap automatically on pull requests.

Two failure modes are caught:

- **Doc drift** - an existing doc page makes a claim that the code change has invalidated
- **Undocumented user-facing change** - no existing doc covers the changed behaviour, but the change is user-visible and probably should be documented

The system posts a structured PR comment with findings and a copy-pasteable agent prompt the author can use to fix the docs immediately.

---

## 2. Architecture

```
PR comment "/check-docs"
        │
        ▼
GitHub Actions: doc-drift.yml
  1. Verify commenter is OWNER (author_association check)
  2. Fetch PR diff via gh pr diff
  3. Invoke Pi headless, passing diff + output file path
  4. Pi runs .pi/agents/skills/doc-drift/ skill
        │
        ├── Explores repo freely (search tools, read files)
        ├── Works through 5-phase decision tree
        └── Writes structured report to output file path
  5. Workflow posts report file as PR comment via gh pr comment
```

**Four artifacts live in this repo:**

| Artifact | Path | Purpose |
|---|---|---|
| Workflow | `.github/workflows/doc-drift.yml` | Trigger, auth, diff fetch, Pi invocation, comment post |
| Skill | `.pi/agents/skills/doc-drift/SKILL.md` | Agent decision tree and output instructions |
| Reference: user-facing criteria | `.pi/agents/skills/doc-drift/references/user-facing-criteria.md` | VectorLint-specific definition of a user-facing change |
| Reference: output format | `.pi/agents/skills/doc-drift/references/comment.md` | Comment format for all cases in both GitHub and local contexts |

---

## 3. GitHub Actions Workflow

**File:** `.github/workflows/doc-drift.yml`

### Trigger

```yaml
on:
  issue_comment:
    types: [created]
```

Filtered to PR comments only: `github.event.issue.pull_request` must exist.
Trigger phrase: comment body must start with `/check-docs` (case-insensitive).

### Auth gate

Check `github.event.comment.user.login` against `author_association`.
Allow only `OWNER`. Any other role gets a reply comment:

> `@<username> Only the repo owner can trigger doc drift checks.`

Workflow exits after posting the reply.

### Steps

```
1. Checkout PR branch
   - actions/checkout@v4
   - ref: the PR head SHA (from github.event.issue.pull_request.url)
   - fetch-depth: 0 (full history for accurate diffs)

2. Setup Node.js (for Pi)

3. Install Pi

4. Fetch PR diff
   - gh pr diff ${{ github.event.issue.number }} > /tmp/pr.diff

5. Post "in progress" reaction (👀) on the triggering comment
   - Gives the author immediate feedback that the workflow started

6. Run Pi headless
   - Initial message: contents of pr.diff + instruction to write one
     report file per behavioral change, named sequentially:
     $GITHUB_WORKSPACE/.doc-drift-1.md, .doc-drift-2.md, etc.
   - Skill: .pi/agents/skills/doc-drift/
   - GITHUB_TOKEN passed as env var (for gh CLI inside Pi if needed)

7. Post each report file as a separate PR comment
   - for file in $(ls $GITHUB_WORKSPACE/.doc-drift-*.md | sort -V); do
       gh pr comment ${{ github.event.issue.number }} --body-file "$file"
     done

8. On failure
   - Post a minimal error comment so the PR is never left silent:
     > "Doc drift check failed. Check the Actions log for details."
```

### Initial message to Pi

```
You are running a doc drift check on a pull request in the VectorLint repository.

The PR diff is:

<diff>
{contents of /tmp/pr.diff}
</diff>

Work through the doc-drift skill. When you have finished, write one report file
per behavioral change you identified, named sequentially:
  $GITHUB_WORKSPACE/.doc-drift-1.md
  $GITHUB_WORKSPACE/.doc-drift-2.md
  ... and so on.

If there are no issues to report, write a single file $GITHUB_WORKSPACE/.doc-drift-1.md
containing the no-issues-found report.

Do not post anything to GitHub directly. The workflow will handle posting.
```

---

## 4. Pi Skill

**File:** `.pi/agents/skills/doc-drift/SKILL.md`

### Purpose

Guide the agent through a five-phase analysis: extract change intents from the diff, search docs using those intents, cross-reference for invalidated claims, assess user-facing coverage, and write a structured output.

### Scope constraints

The agent works only within these boundaries:
- Source changes: `src/` files only. Ignore changes to `tests/`, `.github/`, `package.json`, `tsconfig.json`, `.vectorlint.ini`, and any non-source path.
- Documentation: `docs/*.mdx`, `README.md`, `CLAUDE.md`, and `AGENTS.md`.

### Five-phase decision tree

---

**Phase 1 - Intent extraction**

Read the full diff holistically before doing anything else. The goal is to understand *what changed in terms of user-visible behaviour*, not which files were touched.

For each meaningful change cluster in the diff, write a short intent statement:
- What feature, flag, command, config key, or workflow changed?
- What is the before/after behaviour from a user's perspective?

Discard as noise: whitespace-only changes, test-only changes, internal refactors with no user-visible effect, comment changes, import reordering.

A PR may produce any number of distinct behavioral changes. Extract all of them - do not merge separate changes to fit a limit, and do not stop early. Treat each independently from here.

---

**Phase 2 - Doc search (per intent)**

For each intent, generate search terms at multiple granularities:
- **Exact names**: the precise flag name, command name, config key, or function name as it appears in the diff
- **Concept variants**: synonyms or related terms a doc author might have used (e.g. if a flag is `--output`, also search `output format`, `format`, `output flag`)
- **Feature area**: the module or subsystem name (e.g. `provider`, `scoring`, `chunking`)

Search across `docs/` for each term set using whatever search tools are available. Find candidate files first, then read the relevant sections.

**False negative guard:** if your first set of search terms returns no results, do not immediately conclude there is no documentation. Keep trying alternative terms until additional searches consistently surface files you have already found, or until you can confidently account for all the main terminology a doc author would use for this change. Record what you searched - the output will include this as search coverage.

One intent may surface multiple doc files. That is expected - collect all candidates.

---

**Phase 3 - Cross-reference (per intent × doc candidate)**

For each (intent, candidate doc file) pair:

1. Read the section(s) of the doc that matched the search
2. Ask: does the intent invalidate any claim in this section?
   - A claim is a statement about how a feature works, what a flag does, what the default is, what the output looks like, or what workflow the user should follow
   - The claim is invalidated if the code change makes it factually incorrect or materially incomplete

If yes → record a **drift finding**:
- Which doc file and section
- What the doc currently claims
- What the code change made true instead

If no → the doc is still accurate. No action.

---

**Phase 4 - Coverage assessment (per intent with no doc match)**

For intents where Phase 2 found no candidate doc files after a thorough search:

Consult `references/user-facing-criteria.md`.

If the intent meets the criteria for a user-facing change:
→ record an **undocumented change finding**:
- What changed
- Why it is user-facing
- Whether it likely belongs in an existing doc (and which one) or needs a new topic

If the intent is internal only → discard. Do not mention it in the report.

---

**Phase 5 — Write report**

Write one report file per behavioral change to the numbered paths given in the initial message (`.doc-drift-1.md`, `.doc-drift-2.md`, etc.). Each file is a self-contained comment covering one behavioral change and all doc files affected by it.

Follow the format in `references/comment.md` exactly for each file.

If there are no findings after Phases 3 and 4 → write a single `.doc-drift-1.md` containing the no-issues-found report. Do not skip writing a file.

---

## 5. Reference Files

### `references/user-facing-criteria.md`

Defines what counts as a user-facing change in VectorLint specifically. The agent reads this during Phase 4.

**Contents to include:**

The following are examples of user-facing changes in VectorLint. This list is illustrative, not exhaustive - apply the same judgement to anything with a similar character:
- A CLI flag, command, or exit code
- A configuration key in `.vectorlint.ini` or `config.toml`
- An environment variable name or its accepted values
- A rule frontmatter field (name, id, evaluateAs, etc.)
- A preset name or bundled preset behaviour
- An output format (line, json, vale-json) - structure, field names, values
- A scoring behaviour visible in output (thresholds, density calculation, rubric scoring)
- A provider configuration option or supported model list
- An error message or warning the user reads
- A workflow the documentation describes step-by-step

A change is **not** user-facing if it only affects:
- Internal implementation logic with no observable output change
- Test infrastructure
- Build configuration
- Code style or refactoring with identical external behaviour
- Logging that is only visible in debug mode (unless debug mode is documented)

When in doubt, lean toward flagging. A false positive that the author dismisses is less costly than a false negative that ships as broken docs.

---

### `references/comment.md`

Defines the output format for all scenarios, in both GitHub and local contexts.

**Environment detection:**

Check for the `GITHUB_ACTIONS` environment variable.
- If `GITHUB_ACTIONS=true` → GitHub context: write one report file per behavioral change to the numbered paths given in the initial message. Do not print to terminal. Do not interact with the user.
- If `GITHUB_ACTIONS` is not set → local context: print findings to the terminal, then ask the user whether they want to update the documentation.

**Language note:** never use the word "intent" in any output. Describe each behavioral change in plain language.

---

**GitHub context — drift detected**

One file per behavioral change. Each file is a self-contained PR comment.

```markdown
## ⚠️ Doc drift — {plain language description of what changed}

{for each drift finding under this behavioral change:}
### `{doc file path}` — {section name}

**What the doc claims:** {quote or close paraphrase of the invalidated claim}  
**What's now true:** {one sentence}

Fix prompt:
~~~
{fix prompt for this finding}
~~~

---
{end for}
```

**Fix prompt format — drift:**

Short, direct, one instruction per finding:

```
`{doc file}`, {section}: "{old claim}" is no longer accurate — {correct behaviour}. Update it. Keep all existing structure, tone, and style.
```

---

**GitHub context — undocumented user-facing change**

```markdown
## 📝 Undocumented change — {plain language description of what changed}

{for each undocumented finding under this behavioral change:}
### {suggested doc file, or "New page: {suggested title}"}

**What changed:** {one sentence}  
**Why it needs docs:** {one sentence}

Fix prompt:
~~~
{fix prompt for this finding}
~~~

---
{end for}
```

**Fix prompt format — undocumented change:**

```
Add documentation to `{suggested file}` covering {what changed}. {one sentence on what the new content should say}. Keep all existing structure, tone, and style.
```

---

**GitHub context — no issues found**

A single file: `.doc-drift-1.md`.

```markdown
## ✅ No documentation drift detected

The changes in this PR do not invalidate any existing documentation and do not introduce undocumented user-facing behaviour.

**Search coverage:** {list the behavioral changes extracted and the doc files checked for each, so the author can verify the check was thorough}
```

The search coverage summary matters — it lets the author confirm the agent checked the right things rather than just trusting a green result.

---

**Local context (no GITHUB_ACTIONS)**

Print each behavioral change's findings to the terminal in a readable format. After printing all findings, ask:

> "Would you like me to help you update the documentation now?"

Wait for the user's response before doing anything. If they say yes, guide them through the changes. If no, summarise what they would need to do manually and exit.

The search coverage summary matters — it lets the author confirm the agent checked the right things rather than just trusting a green result.

---

**Local context (no GITHUB_ACTIONS)**

Print each behavioral change's findings to the terminal in a readable format. After printing all findings, ask:

> "Would you like me to help you update the documentation now?"

Wait for the user's response before doing anything. If they say yes, guide them through the changes. If no, summarise what they would need to do manually and exit.

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| PR only changes tests | All changes discarded in Phase 1 as noise. Report: no issues found. |
| PR changes a doc file directly | Ignore doc file changes in the diff - we only analyse source changes against docs, not doc-against-doc. |
| One behavioral change affects multiple doc files | Report a finding per doc file. Each gets its own section within that behavioral change's comment. |
| Two behavioral changes affect the same doc file | Each gets its own comment. The per-change comment model handles this naturally — no special grouping needed. |
| Agent finds no results after exhaustive search for a behavioral change | Note under "search coverage" in the no-issues comment what was searched. Do not silently drop it. |
| Very large diff (many behavioral changes) | Process all of them. If more than six are found, note at the top of each comment that this is a large PR and findings should be reviewed carefully. |
| Pi fails or times out | Workflow step 8 catches this and posts the error comment. |

---

## 7. What This Does Not Do

- It does not edit documentation. It only identifies what needs updating and generates a prompt to do so.
- It does not run on every push or every PR automatically. It is manually triggered by comment.
- It does not check documentation quality or style. VectorLint itself can do that separately.
- It does not support external documentation repositories. Docs must live in `docs/` within this repo.
- It is not generalised for other repositories. The user-facing criteria and doc paths are VectorLint-specific.
