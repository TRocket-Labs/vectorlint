---
evaluator: base
type: check
id: Repetition
name: Repetition
severity: warning
evaluateAs: document
---

# Repetition
Flag any instance where the same word appears consecutively or near-consecutively in a sentence (e.g., "the the build" or "you can can also"), or where the same idea is expressed in more than one sentence within the same section without adding new information (e.g., "This speeds up your workflow. It helps teams work faster and get more done."). Do not flag repeated product names, feature names, or technical terms where varying the language would introduce ambiguity (e.g., "Components" repeated throughout a section about components), and do not flag repetition across structurally independent elements like cards, list items, or callouts that are designed to be read on their own (e.g., a card description that echoes a phrase from the body text it links to).