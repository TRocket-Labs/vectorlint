---
evaluator: base
type: check
id: PassiveVoice
name: Passive Voice
severity: warning
evaluateAs: document
---

Identify passive voice constructions in the content:

- Flag phrases like "was done by", "is being used", "has been created"
- Suggest active voice alternatives for each flagged instance
- Exception: passive voice is acceptable when the actor is unknown or unimportant — do not flag these cases
