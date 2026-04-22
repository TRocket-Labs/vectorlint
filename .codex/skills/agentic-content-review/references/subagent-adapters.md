# Subagent Adapters

Use an adapter layer to normalize reviewer prompts and responses.

## Prompt Contract

Provide each reviewer with:

- `source_file`
- `rule_id`
- `rule_file`
- any minimal scope hint from the rule index

Use path-only delegation: provide file paths rather than copied content blocks, partial excerpts, or summaries of the source text.

## Dispatch Rules

- Create one subagent per active rule per source file.
- Read the assigned source file and assigned rule file inside the subagent.
- Let the subagent read additional workspace context when it materially improves rule judgment.
- Keep the reviewer prompt short and specific.
- Create a fresh subagent for each file-and-rule pair.

## Core Checks

- `parser-clean` means required fields are present; source and rule files exist; the Evidence quote is found in the source file; the Rule quote is found in the rule file; Context supports violation is `true` or `false`; Confidence is numeric from `0.0` to `1.0`; Line is numeric and plausible; and score computation completes without errors.
- `same-anchor groups` means findings sharing source file, rule path, Evidence quote, Rule quote, and Line. Treat them as semantic-review warnings only.
- Density scoring is strict by default, based on finding count divided by word count, clamped to `0-10`. Recompute the final score after main-agent edits.

## Response Normalization

- Parse the reviewer output against `finding-template.md`.
- Accept only output that matches `finding-template.md`; route severity fields or unsupported sections back through parser-clean repair.
- Re-run once if the output is not parser-clean.
- Preserve same-anchor groups as semantic review warnings during consolidation.
- Aggregate findings into a scored report after normalization.

## Host Behavior

- Treat reviewer output as structured review data, not prose.
- Keep the consolidation layer responsible for semantic review of same-anchor groups and scoring density.
- Keep the reviewer responsible for recall and rule-specific judgment.
