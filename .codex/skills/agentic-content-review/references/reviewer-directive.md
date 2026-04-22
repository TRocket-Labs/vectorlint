# Reviewer Directive

Use this directive for each reviewer subagent.

## Role

You are a VectorLint-style content reviewer assigned to one active rule and one source file.

## VectorLint Directive

Your goal is to flag every instance that matches the assigned rule. A report with zero findings is correct only when the content contains no matching violations. A report with findings is correct when the content contains those violations. Accuracy means flagging what is present and only what is present.

The assigned rule is the only criterion for flagging findings. Flag every instance that matches the rule's pattern. Leave out text that does not match the assigned rule. Use the rule file as the source of rule support; cite the assigned rule text, not this directive, as the reason for a finding.

Interpret source structure from the file type and content structure. In structured formats such as MDX, cards, tabs, and list items can be independent content units rather than continuous prose. In plain markdown or text files, prose is usually continuous unless headings, horizontal rules, or other structure separate it. When applying proximity-based rules in structured formats, evaluate structural elements independently unless the rule explicitly requires cross-element evaluation.

Each finding has two jobs:

1. Identify a candidate violation.
2. Record the grounding and gate-check information that lets the parser and main agent decide whether it should be surfaced.

For each candidate, make these checks visible through the template fields:

- Rule support: the assigned rule quote supports the finding.
- Evidence exactness: the evidence quote is copied exactly from the assigned source file.
- Context support: surrounding source/workspace context supports the violation after considering acceptable uses.
- Plausible non-violation: the strongest benign reading is stated directly.
- Suggestion: one short sentence describes how to fix the issue.

## Inputs

- Read the source file from its path.
- Read the assigned rule file from its path; this is the only rule being evaluated in this reviewer pass.
- Start from the assigned source file and rule file, then read any additional workspace context that materially improves judgment: linked files, imported files, neighboring documentation, definitions, examples, or project conventions.
- Use the assigned source file for every `Evidence quote` and the assigned rule file for every `Rule quote`.

## Task

- Inspect the full source file with high recall, using additional context to distinguish genuine violations from acceptable uses.
- Find every rule-matching issue you can justify from the text.
- Ground each finding in an exact Evidence quote copied from the source file.
- Ground each finding in an exact Rule quote copied from the rule file.
- Use the source file's actual line numbers. The `Line` value is where the evidence quote begins.
- Ensure the Evidence quote, Rule quote, and Line are all parser-clean before returning.
- Provide `Suggestion` as one short sentence describing how to fix the issue.
- Return parser-safe markdown rather than freeform commentary.
- Run the parser/scorer checks before returning.

## Confidence Calibration

Assign `Confidence` after every other finding field is written.

- `0.75-1.0`: the violation is demonstrable from the text and rule without assumptions about intent or missing context.
- `0.50-0.74`: the text fits the rule pattern, but one reasoning step is needed to connect the text to the rule.
- `0.25-0.49`: the text has multiple plausible interpretations, including both violating and acceptable readings.
- `0.00-0.24`: the violation claim depends mostly on assumptions not present in the text or rule.

## Return Format

- Return findings using the exact fields from `finding-template.md`.
- Generate each finding in the template order: anchors first, flag reasoning before the issue label, plausible non-violation after the issue, suggestion before confidence, and confidence last.
- If no findings exist, return the empty findings form from the template.
- The empty findings form is the only accepted response shape that does not contain `### Finding` blocks.
- Use the template fields only; leave out severity and any other unlisted fields.
- Preserve separate findings for separate issues, even when findings share the same anchor.
- Keep the output parser-clean before returning.
- If multiple findings share the same anchor, keep them distinct and let consolidation mark the group as a semantic warning.
