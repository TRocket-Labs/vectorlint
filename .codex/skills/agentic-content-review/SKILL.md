---
name: agentic-content-review
description: Agentic VectorLint-style content review using active markdown rules, one-rule-per-subagent delegation, parser-clean markdown findings, exact quote grounding, and density scoring. Use when reviewing docs, marketing copy, specs, PR descriptions, implementation artifacts, or other prose/content files against workspace rules in .vlint/rules or skill-bundled default rules.
---

# Agentic Content Review

Use this skill to review prose and other content files against active markdown rules with an agent-native workflow.

## Review Model

- Delegate one reviewer subagent per active rule per source file.
- Use path-only delegation: provide source and rule file paths, and let the reviewer read the files directly.
- Have each reviewer read the source file and exactly one rule file itself.
- Optimize the reviewer pass for high recall, then use the main-agent audit to remove unsupported findings.
- Require each reviewer to run parser and scorer checks before returning.

## Core Definitions

- `parser-clean` means all required finding fields are present; source and rule files exist; the Evidence quote is found in the source file; the Rule quote is found in the rule file; Context supports violation is `true` or `false`; Confidence is numeric from `0.0` to `1.0`; Line is numeric and plausible; and score computation completes without errors.
- `same-anchor groups` means findings that share source file, rule path, Evidence quote, Rule quote, and Line. Treat them as semantic-review warnings only, never as duplicate decisions.
- Density scoring is strict by default, based on finding count divided by word count, clamped to a `0-10` range. Recompute the final score after main-agent edits.

## Reviewer Sub-Agent Setup

If your toolset supports sub-agent definitions, check whether a sub-agent definition named `content-reviewer` exists in your workspace's sub-agent directory. If it does not exist, announce that you are creating it and create it using the content of `references/reviewer-directive.md` as its directive. Do not spin up a sub-agent at this step — only create the definition.

If your toolset does not support sub-agent definitions, announce it and proceed using your toolset's inline sub-agent capability with `references/reviewer-directive.md` as the prompt.

---

## Workflow

1. Resolve active rules from workspace `.vlint/rules/*/rule-index.yml` files, or from bundled defaults at `.codex/skills/agentic-content-review/rules/default/rule-index.yml` when no workspace indexes exist or the caller explicitly asks for defaults.
2. Pair each source file with every active rule.
3. Dispatch one reviewer subagent for each file-and-rule pair.
4. Collect markdown findings with exact Evidence quotes and Rule quotes.
5. Run parser and scorer validation on every reviewer response.
6. Treat same-anchor groups as semantic review warnings, not duplicate decisions.
7. Consolidate into a scored report with findings, warnings, and a short recommendation.

## Output Rules
- Use the empty-findings form from `references/finding-template.md` when the reviewer finds no issues.
- Keep findings structurally consistent with `references/finding-template.md`.
- Ground every finding in exact Evidence and Rule quotes.
- Keep final claims grounded in exact Evidence and Rule quotes plus the main-agent semantic audit.
- Use `references/rule-index-format.md` to resolve active rules from YAML pack indexes.
- Use `references/reviewer-directive.md` to prompt reviewer subagents.
- Use `references/subagent-adapters.md` to normalize subagent output.


## Commands

List active rules:

```bash
npx tsx .codex/skills/agentic-content-review/scripts/list-active-rules.ts <workspace-root>
```

Use bundled defaults even when workspace rules exist:

```bash
npx tsx .codex/skills/agentic-content-review/scripts/list-active-rules.ts <workspace-root> --include-defaults
```

Parse and score review markdown:

```bash
npx tsx .codex/skills/agentic-content-review/scripts/parse-review-and-score.ts <review.md> --write-log
```
