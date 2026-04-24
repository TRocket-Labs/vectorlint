---
specVersion: 1.0.0
type: check
id: Wordiness
name: Wordiness
severity: warning
evaluateAs: document
---

# Wordiness

Flag any instance where a wordy phrase is used in place of a shorter, simpler equivalent (e.g., "in order to" instead of "to", "due to the fact that" instead of "because", "has the ability to" instead of "can", "at this point in time" instead of "at this point"). This includes multi-word phrases that can be reduced to a single word, roundabout constructions that obscure a simpler verb or preposition, and redundant pairs where one word carries the full meaning (e.g., "gather together" instead of "gather", "close down" instead of "close"). Do not flag phrases where the longer form is required for clarity or where the substitution would change the meaning.