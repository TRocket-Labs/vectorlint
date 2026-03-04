---
specVersion: 1.0.0
evaluator: base
type: check
id: UnsupportedClaims
name: Unsupported Claims
severity: warning
evaluateAs: document
---

# Unsupported Claims
Flag any claim that states a specific number, percentage, comparison, or causal relationship as fact without an inline citation or named source (e.g., "70% of users abandon their cart," "poor onboarding causes churn," "most developers prefer static typing"). 

Also flag vague authority citations where the source is unnamed (e.g., "experts say," "research shows," "it is well established"). 

Do not flag claims the author makes about their own product or organization in the first person (e.g., "we processed over 1M requests last month," "our platform supports 40+ integrations"), as these are self-reported and do not require a third-party source.