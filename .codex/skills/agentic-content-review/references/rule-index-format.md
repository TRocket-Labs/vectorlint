# Rule Index Format

Use YAML rule indexes stored at `.vlint/rules/<rule-pack-name>/rule-index.yml`.
Bundled defaults live at `.codex/skills/agentic-content-review/rules/default/rule-index.yml`.

## Shape

```yaml
pack: brand
active: true
rules:
  - id: voice
    name: Brand Voice
    path: voice.md
    active: true
    description: Check whether content matches brand tone and voice.
```

## Selection Rules

- Dispatch reviewers only for rules marked `active: true`.
- Resolve the rule file relative to the pack directory before creating the subagent prompt.
- Use bundled defaults only when no workspace `.vlint/rules/*/rule-index.yml` exists or the caller explicitly asks for defaults.
