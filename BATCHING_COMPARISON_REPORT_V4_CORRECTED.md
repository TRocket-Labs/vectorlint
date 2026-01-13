# Rule Batching Optimization - Comparison Report (V4 Final)

**Scope:** Manual Verification on `test.md`
**Experiment:** "Task-Based" Prompt + Reduced Batch Size (Limit 2)
**Date:** 2026-01-13
**Status:** 🛑 **Optimization Failed - Feature Disabled**

---

## Executive Summary

We performed a deep manual inspection of the evaluation results for `tests/fixtures/technical-accuracy/test.md` to verify the automated metrics.

**Verdict:** The batching optimization introduces **instability**. While it successfully identified some issues (and even one that the baseline missed), it suffered from two critical failures:
1.  **Context Bleed (Hallucination):** Applying the logic of Rule A to the context of Rule B.
2.  **Missed Violations:** Failing to detect structural issues (Repetition) that required whole-document scanning.

---

## 🔍 Detailed Finding Comparison

| Rule | Issue Location | Baseline | Batched | Analysis |
| :--- | :--- | :--- | :--- | :--- |
| **AIPattern** | Line 13 ("ensures") | ✅ Found | ✅ Found | **Match** |
| **AIPattern** | Line 31 ("verify") | - | ❌ Found | **False Positive:** Flagged as an AIPattern violation likely because it was also a PseudoAdvice violation. The contexts merged. |
| **PseudoAdvice**| Line 31 ("Always verify") | ✅ Found | ✅ Found | **Match** |
| **PseudoAdvice**| Line 21 ("Always trust") | ❌ Missed | ✅ Found | **New Detection:** Batched model outperformed baseline here. |
| **Repetition** | Line 29 (CloudLint) | ✅ Found | ❌ Missed | **Missed:** The model failed to hold the document structure in memory while processing other rules. |

---

## 📉 Root Cause Analysis

### 1. The "Context Bleed" Phenomenon
The most concerning finding is the **False Positive on Line 31**.
*   **The Text:** *"Always verify AI-generated claims..."*
*   **Rule A (PseudoAdvice):** Correctly flagged this as an imperative without steps.
*   **Rule B (AIPattern):** *Incorrectly* flagged this. The analysis explicitly stated *"No listed buzzwords... No change needed"*, yet it still generated a Warning.
*   **Theory:** The model "felt" the violation from Rule A and allowed it to contaminate the result for Rule B.

### 2. Logic Collapse on Structural Rules
`VectorLint.Repetition` requires scanning the entire document to find duplicates. In the Batched run, this global attention mechanism failed, likely because the model's attention was fragmented by the local line-by-line checks for AIPattern/PseudoAdvice.

---

## 🛑 Final Decision

The feature remains **DISABLED**.
While the token savings (~70%) are attractive, the **cross-contamination of rules** (Context Bleed) makes the linter unreliable. Users would be confused by warnings that cite the wrong rule or contradict themselves.

**Infrastructure Status:**
*   Code: Merged & Preserved.
*   Config: `BatchRules=false`.
*   Future Work: Requires multi-pass or iterative prompting to solve Context Bleed.
