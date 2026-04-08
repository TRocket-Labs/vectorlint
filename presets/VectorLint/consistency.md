---
specVersion: 1.0.0
type: check
id: Consistency
name: Consistency
severity: warning
evaluateAs: document
---

# Consistency

## Naming & Terminology Inconsistency

Flag any instance where the same thing — a product name, role, feature, or concept — is referred to by two or more different names, spellings, or capitalizations within the document. This includes proper nouns with inconsistent casing (e.g., "Github" vs. "GitHub"), roles with swapped labels (e.g., "User" vs. "Customer" for the same person), and features or concepts named differently across sections without a declared equivalence. Only compare names that appear in body text. 

Do not treat bold labels or headings as authoritative name declarations, and do not flag differences between a heading or bold label and its accompanying body text.

## POV Inconsistency

Flag any instance where the document shifts between second person and third person when referring to the same entity (e.g., "you can configure this" in one section and "users can configure this" in another, where both refer to the reader). 

Do not flag first person plural ("we", "our") when it is clearly the author referring to themselves or their organization (e.g., "we built this to help you move faster"). Only flag when "we" is used in place of "you" to address the reader directly (e.g., "we can set this up by navigating to…" where the intended subject is the reader). 

Do not flag switches between "you" and a third person noun like "users" or "developers" if the two terms refer to distinct entities within the content (e.g., "you" referring to the developer implementing the tool and "users" referring to that developer's end customers).
