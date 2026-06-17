# Doc Drift Checker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitHub Actions workflow that detects documentation drift in VectorLint pull requests by invoking a Pi agent with the PR diff and posting per-behavioral-change findings as PR comments.

**Architecture:** A `/check-docs` PR comment triggers a workflow that fetches the diff, runs Pi headless with a bundled skill, and posts one structured comment per behavioral change found. The skill guides the agent through five phases: extract behavioral changes from the diff, search docs, cross-reference for invalidated claims, assess user-facing coverage, write one report file per change.

**Tech Stack:** GitHub Actions, Pi (agent harness), Markdown skill files, `gh` CLI, YAML

**Spec:** `docs/superpowers/specs/2026-06-17-doc-drift-design.md`

---

### Task 1: Create Pi skill directory and SKILL.md

**Files:**
- Create: `.pi/agents/skills/doc-drift/SKILL.md`

**Step 1: Create the directory**

```bash
mkdir -p .pi/agents/skills/doc-drift/references
```

**Step 2: Write SKILL.md**

Create `.pi/agents/skills/doc-drift/SKILL.md` with this exact content:

```markdown
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
```

**Step 3: Verify the file exists and is well-formed**

```bash
cat .pi/agents/skills/doc-drift/SKILL.md
```

Expected: file prints cleanly with YAML frontmatter at the top.

**Step 4: Commit**

```bash
git add .pi/agents/skills/doc-drift/SKILL.md
git commit -m "Add doc-drift Pi skill"
```

---

### Task 2: Write user-facing-criteria.md reference

**Files:**
- Create: `.pi/agents/skills/doc-drift/references/user-facing-criteria.md`

**Step 1: Write the file**

```markdown
# User-Facing Change Criteria — VectorLint

The following are examples of user-facing changes in VectorLint. This list is illustrative, not exhaustive — apply the same judgement to anything with a similar character:

- A CLI flag, command, or exit code
- A configuration key in `.vectorlint.ini` or `config.toml`
- An environment variable name or its accepted values
- A rule frontmatter field (name, id, evaluateAs, etc.)
- A preset name or bundled preset behaviour
- An output format (line, json, vale-json) — structure, field names, values
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

When in doubt, lean toward flagging. A false positive the author dismisses is less costly than a false negative that ships as broken docs.
```

**Step 2: Commit**

```bash
git add .pi/agents/skills/doc-drift/references/user-facing-criteria.md
git commit -m "Add user-facing-criteria reference for doc-drift skill"
```

---

### Task 3: Write comment.md reference

**Files:**
- Create: `.pi/agents/skills/doc-drift/references/comment.md`

**Step 1: Write the file**

```markdown
# Output Format — Doc Drift

## Environment detection

Check for the `GITHUB_ACTIONS` environment variable.
- If `GITHUB_ACTIONS=true` → GitHub context: write one report file per behavioral change to the numbered paths given in the initial message. Do not print to terminal. Do not interact with the user.
- If `GITHUB_ACTIONS` is not set → local context: print findings to the terminal, then ask the user whether they want to update the documentation.

**Language note:** never use the word "intent" in any output. Describe each behavioral change in plain language.

---

## GitHub context — drift detected

One file per behavioral change. Each file is a self-contained PR comment.

````markdown
## ⚠️ Doc drift — {plain language description of what changed}

{for each drift finding under this behavioral change:}
### `{doc file path}` — {section name}

**What the doc claims:** {quote or close paraphrase of the invalidated claim}
**What's now true:** {one sentence}

Fix prompt:
~~~
`{doc file}`, {section}: "{old claim}" is no longer accurate — {correct behaviour}. Update it. Keep all existing structure, tone, and style.
~~~

---
{end for}
````

---

## GitHub context — undocumented user-facing change

````markdown
## 📝 Undocumented change — {plain language description of what changed}

{for each undocumented finding under this behavioral change:}
### {suggested doc file, or "New page: {suggested title}"}

**What changed:** {one sentence}
**Why it needs docs:** {one sentence}

Fix prompt:
~~~
Add documentation to `{suggested file}` covering {what changed}. {one sentence on what the new content should say}. Keep all existing structure, tone, and style.
~~~

---
{end for}
````

---

## GitHub context — no issues found

A single file: `.doc-drift-1.md`.

````markdown
## ✅ No documentation drift detected

The changes in this PR do not invalidate any existing documentation and do not introduce undocumented user-facing behaviour.

**Search coverage:** {list the behavioral changes extracted and the doc files checked for each, so the author can verify the check was thorough}
````

---

## Local context (no GITHUB_ACTIONS)

Print each behavioral change's findings to the terminal in a readable format. After printing all findings, ask:

> "Would you like me to help you update the documentation now?"

Wait for the user's response. If yes, guide them through the changes. If no, summarise what they would need to do manually and exit.
```

**Step 2: Commit**

```bash
git add .pi/agents/skills/doc-drift/references/comment.md
git commit -m "Add comment output format reference for doc-drift skill"
```

---

### Task 4: Write the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/doc-drift.yml`

This is the most complex artifact. Read through the whole step before writing.

**Step 1: Write the workflow**

```yaml
name: Doc Drift Check

on:
  issue_comment:
    types: [created]

jobs:
  check-docs:
    name: Check documentation drift
    runs-on: ubuntu-latest
    # Only run on PR comments that start with /check-docs
    if: |
      github.event.issue.pull_request != null &&
      startsWith(github.event.comment.body, '/check-docs')

    permissions:
      issues: write
      pull-requests: write
      contents: read

    steps:
      - name: Check authorization
        id: auth
        uses: actions/github-script@v7
        with:
          script: |
            const association = context.payload.comment.author_association;
            if (association !== 'OWNER') {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: `@${context.payload.comment.user.login} Only the repo owner can trigger doc drift checks.`
              });
              core.setOutput('authorized', 'false');
            } else {
              core.setOutput('authorized', 'true');
            }

      - name: React to comment
        if: steps.auth.outputs.authorized == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.reactions.createForIssueComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: context.payload.comment.id,
              content: 'eyes'
            });

      - name: Get PR head SHA
        id: pr
        if: steps.auth.outputs.authorized == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            const pr = await github.rest.pulls.get({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number
            });
            core.setOutput('head_sha', pr.data.head.sha);

      - name: Checkout PR branch
        if: steps.auth.outputs.authorized == 'true'
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.pr.outputs.head_sha }}
          fetch-depth: 0

      - name: Setup Node.js
        if: steps.auth.outputs.authorized == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Pi
        if: steps.auth.outputs.authorized == 'true'
        # TODO: confirm exact Pi package name and install command with owner
        run: npm install -g @earendil-works/pi-coding-agent

      - name: Fetch PR diff
        if: steps.auth.outputs.authorized == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr diff ${{ github.event.issue.number }} > /tmp/pr.diff
          echo "Diff size: $(wc -l < /tmp/pr.diff) lines"

      - name: Run doc drift check
        if: steps.auth.outputs.authorized == 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          DIFF_CONTENT=$(cat /tmp/pr.diff)
          # TODO: confirm exact Pi headless invocation flags with owner
          # The message instructs the agent to write one file per behavioral change
          pi --headless \
            --skill .pi/agents/skills/doc-drift \
            --message "You are running a doc drift check on a pull request in the VectorLint repository.

The PR diff is:

<diff>
${DIFF_CONTENT}
</diff>

Work through the doc-drift skill. When you have finished, write one report file
per behavioral change you identified, named sequentially:
  $GITHUB_WORKSPACE/.doc-drift-1.md
  $GITHUB_WORKSPACE/.doc-drift-2.md
  ... and so on.

If there are no issues to report, write a single file $GITHUB_WORKSPACE/.doc-drift-1.md
containing the no-issues-found report.

Do not post anything to GitHub directly. The workflow will handle posting."

      - name: Post report comments
        if: steps.auth.outputs.authorized == 'true' && success()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REPORT_FILES=$(ls $GITHUB_WORKSPACE/.doc-drift-*.md 2>/dev/null | sort -V)
          if [ -z "$REPORT_FILES" ]; then
            gh pr comment ${{ github.event.issue.number }} \
              --body "Doc drift check completed but produced no output. Check the [Actions log](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}) for details."
          else
            for file in $REPORT_FILES; do
              gh pr comment ${{ github.event.issue.number }} --body-file "$file"
            done
          fi

      - name: Post failure comment
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr comment ${{ github.event.issue.number }} \
            --body "Doc drift check failed. Check the [Actions log](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}) for details."
```

**Step 2: Validate YAML syntax**

```bash
# Install yamllint if not present
pip install yamllint 2>/dev/null || true
yamllint .github/workflows/doc-drift.yml
```

Expected: no errors. If yamllint is unavailable, use Python:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/doc-drift.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

**Step 3: Commit**

```bash
git add .github/workflows/doc-drift.yml
git commit -m "Add doc-drift GitHub Actions workflow

- Triggers on /check-docs PR comment by OWNER
- Fetches PR diff, runs Pi headless with doc-drift skill
- Posts one PR comment per behavioral change found
- Posts failure comment if workflow errors"
```

---

### Task 5: Verify Pi invocation and add required secrets documentation

**Files:**
- Create: `docs/superpowers/doc-drift-setup.md`

Before this system can run end-to-end, two things need confirming:

1. **Pi CLI flags** — the workflow uses `pi --headless --skill <path> --message <text>`. Confirm the exact flags with the Pi documentation or owner before the first real run. The `TODO` comments in the workflow mark where this may need updating.

2. **Required secrets** — the workflow needs `ANTHROPIC_API_KEY` (or whichever provider key Pi will use) added to the repository secrets.

**Step 1: Write setup notes**

Create `docs/superpowers/doc-drift-setup.md`:

```markdown
# Doc Drift Checker — Setup Notes

## Required secrets

Add these to the repository secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | LLM provider key for Pi agent |

## Pi CLI invocation

The workflow at `.github/workflows/doc-drift.yml` uses:

```bash
pi --headless --skill <path> --message "<text>"
```

Verify the exact flags against the Pi documentation before the first run.
The `TODO` comments in the workflow mark the two places that may need updating:
1. The `npm install` command (confirm exact package name)
2. The `pi` invocation flags

## Triggering a check

On any open PR, comment:

```
/check-docs
```

The workflow will react with 👀, run the check, and post one comment per
behavioral change detected (or a single clean pass comment if nothing is found).

## Skill location

`.pi/agents/skills/doc-drift/`
├── SKILL.md                        — agent decision tree
└── references/
    ├── user-facing-criteria.md     — what counts as user-facing in VectorLint
    └── comment.md                  — output format for all scenarios
```

**Step 2: Commit**

```bash
git add docs/superpowers/doc-drift-setup.md
git commit -m "Add doc-drift setup notes (secrets, Pi flags)"
```

---

### Task 6: End-to-end smoke test

This task can only be run once the Pi CLI flags are confirmed and the secret is set.

**Step 1: Open a test PR**

Create a branch with a small `src/` change — anything that touches a documented feature. For example, add a comment or log line to `src/cli/index.ts`.

```bash
git checkout -b test/doc-drift-smoke
# make a trivial src/ change
git commit -m "test: trivial change to smoke test doc drift"
gh pr create --title "Smoke test: doc drift checker" --body "Testing /check-docs trigger"
```

**Step 2: Trigger the check**

On the PR, comment:

```
/check-docs
```

**Step 3: Verify workflow behaviour**

Check the Actions log confirms:
- 👀 reaction posted on triggering comment
- Diff fetched successfully
- Pi ran without error
- At least one `.doc-drift-*.md` file was written
- Comment(s) posted on the PR

**Step 4: Clean up**

```bash
gh pr close <pr-number>
git checkout main
git branch -D test/doc-drift-smoke
```

---

## ⚠️ Before Task 4 runs in CI

Confirm the Pi headless CLI syntax with the owner. The workflow has two `TODO` comments marking the install command and invocation flags. These should be resolved before merging to main.
