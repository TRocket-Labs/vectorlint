# Finding Template

Use this exact field set for each markdown finding. Replace placeholder text with actual values.

```md
### Finding
- Rule path: `relative/path/to/rule.md`
- Source file: `relative/or/absolute/path.md`
- Line: `source line number where the evidence quote begins`
- Evidence quote: `exact source text supporting the finding`
- Rule quote: `exact text copied from the rule file`
- Flag reasoning: `why the evidence, rule, context, and plausible non-violation make this worth flagging`
- Issue: `one sentence describing the problem`
- Plausible non-violation: `one sentence describing the best benign interpretation`
- Context supports violation: `true or false`
- Suggestion: `one short sentence describing how to fix the issue`
- Confidence: `number from 0.0 to 1.0 reflecting certainty this is a genuine violation`
```

## Field Meanings

- `Flag reasoning`: concise explanation of why the finding should be surfaced after considering the evidence quote, rule quote, surrounding context, and plausible non-violation.
- `Plausible non-violation`: the strongest benign interpretation to consider after identifying the issue.
- `Context supports violation`: `true` when the surrounding source/workspace context strengthens the violation claim after considering the plausible non-violation; `false` when the context weakens or undermines the claim.
- `Suggestion`: one short sentence describing how to fix the issue. This maps to VectorLint's `suggestion` field.
- `Confidence`: number from `0.0` to `1.0` reflecting certainty that this is a genuine violation after considering rule support, evidence, context, and plausible non-violation.

## Empty Findings

If a reviewer has no findings, return:

```md
## Findings
No findings.
```

This empty-findings form is the only accepted response shape that does not contain `### Finding` blocks.
