---
evaluator: base
type: check
id: Capitalization
name: Capitalization
severity: warning
evaluateAs: document
---

# Capitalization

Flag any instance where headings within the same document are inconsistent in their capitalization style. Identify the dominant style used across headings — either title case (e.g., "Getting Started With the API") or sentence case (e.g., "Getting started with the API") — and flag any heading that deviates from it. For title case, also flag when the document mixes AP and Chicago conventions, such as capitalizing prepositions in some headings but not others (e.g., "Working With Your Team" vs. "Working with Your Team"). Do not flag proper nouns or product names that are always capitalized regardless of heading style.