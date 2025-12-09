---
evaluator: base
type: {{EVALUATION_TYPE}}
id: {{RULE_ID}}
name: {{RULE_NAME}}
severity: {{SEVERITY}}
{{#if CRITERIA}}
criteria:
{{#each CRITERIA}}
  - name: {{name}}
    id: {{id}}
    weight: {{weight}}
{{/each}}
{{/if}}
---

{{PROMPT_BODY}}

{{#if RUBRIC}}
{{RUBRIC}}
{{/if}}
