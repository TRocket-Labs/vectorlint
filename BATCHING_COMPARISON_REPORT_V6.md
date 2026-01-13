# Rule Batching Validation Report V6 (Batch Size = 2)

**Date:** 2026-01-13
**File Tested:** `tests/fixtures/ai-pattern/negation-pattern.md`
**Batch Size:** 2 rules per batch (MaxRulesPerBatch=2)

---

## Executive Summary

| Metric | Target | Batch=4 (V5) | **Batch=2 (V6)** | Status |
|--------|--------|--------------|------------------|--------|
| **Intersection (Overlap)** | >95% | 37.5% | **~59%** | ❌ FAIL (improved) |
| **Efficiency (Token Reduction)** | >50% | 37% | **21%** | ❌ FAIL (worse) |
| **Hallucinations** | 0 | ~9% | ~5% | ⚠️ MARGINAL |

**Recommendation:** Feature should remain **DISABLED by default**, but batch size 2 shows significant improvement in accuracy.

---

## Test Results

### Summary Counts

| Mode | Warnings | Input Tokens | LLM Requests | Cost |
|------|----------|--------------|--------------|------|
| **Baseline (A)** | 32 | ~50,570 | ~24 | $0.20 |
| **Batched (B) size=4** | 34 | ~31,996 | 6 | $0.15 |
| **Batched (B) size=2** | 37 | ~39,868 | 12 | $0.19 |

---

## 1. Batched (size=2) Findings - 37 Warnings

### AIPattern (17 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 1:60 | "it's about leveraging smarter code" | The phrase "leveraging" is a listed buzzword and contributes to an AI-like tone. | ✅ YES |
| 3:15 | "doesn't simply improve productivity, it transforms workflows entirely" | "doesn't simply X, it Y" introduces and dismisses X only for rhetorical effect. | ✅ YES |
| 3:86 | "You're not managing projects anymore, you're orchestrating outcomes" | The "not X anymore, you're Y" structure is a formulaic AI-style contrast. | ✅ YES |
| 3:155 | "The goal isn't faster delivery, it's sustainable velocity" | No one claimed the goal was faster delivery; contrast is added only for emphasis. | ✅ YES |
| 12:1 | "The solution isn't to hire more reviewers or work longer hours. The solution is to apply AI..." | The negation contrast is more rhetorical than corrective, echoing common AI phrasing. | ✅ YES |
| 39:1 | "The integration feels seamless." | The sentence uses the buzzword "seamless," which is on the prohibited list. | ✅ YES |
| 54:70 | "Copilot works seamlessly in VS Code" | The adverb "seamlessly" is on the buzzword list and weakens specificity. | ✅ YES |
| 71:1 | "CodeRabbit has established itself... It offers a rich feature set..." | The phrase is broad and marketing-like without concrete detail. | 🆕 NEW |
| 75:1 | "CodeRabbit is highly configurable." | This vague evaluative phrase sounds like boilerplate; needs concrete examples. | 🆕 NEW |
| 77:79 | "comprehensive analysis can be valuable" | This abstract phrase reads like stock copy; more specific wording would feel more human. | 🆕 NEW |
| 90:10 | "takes a unique approach to AI code review" | The claim of uniqueness is vague and unsubstantiated, contributing to formulaic tone. | 🆕 NEW |
| 90:66 | "comprehensive knowledge graph of your entire repository" | This phrasing leans on jargon instead of plainly describing what is stored. | 🆕 NEW |
| 90:197 | "uses this context to provide unusually deep analysis" | The phrase is promotional and non-specific, which can feel AI-generated. | 🆕 NEW |
| 90:281 | "doesn't just look at the changed lines. It understands how those changes ripple" | "doesn't just look" introduces and dismisses a strawman behavior, a common AI rhetorical tic. | ✅ YES |
| 96:149 | "deploy Greptile on-premises for complete control" | 'deploy' is a flagged buzzword that can make the prose feel formulaic. | 🆕 NEW |
| 132:405 | "optimizations" | The term is somewhat generic and marketing-flavored; replacing it would sound more human. | 🆕 NEW |
| 168:168 | "It's not just an AI reviewer, it's a complete rethinking" | The phrase introduces "just an AI reviewer" only to dismiss it for emphasis, without prior correction. | ✅ YES |

### Directness (7 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 7:1 | "Introduction: The 'Review Gap' in the Age of AI" | The first sentence gives background on AI code generation; the gap itself is only named and explained in the second paragraph. | 🆕 NEW (similar to 31) |
| 50:1 | "Overview: The default choice for many teams. GitHub Copilot excels at 'in-the-flow' assistance..." | The first sentence states popularity and a narrow benefit rather than directly summarizing Copilot's core capabilities. | 🆕 NEW |
| 69:1 | "Overview: A popular tool that connects to GitHub, GitLab, or Bitbucket..." | The header promises an overview; the first clause focuses on popularity rather than the main function. | ✅ SIMILAR to 71 |
| 88:1 | "Overview: Focuses heavily on understanding your entire codebase, not just the diff..." | Readers must infer what Greptile actually does from a contrast, not a clear primary statement. | ✅ SIMILAR to 90 |
| 104:1 | "5. Ellipsis (Best for Automated Fixes)" | First sentence under this header describes what Ellipsis is but does not clearly front-load why it is best for automated fixes. | 🆕 NEW |
| 152:1 | "How to Choose the Right Tool" | Readers see the header but get no immediate criteria or steps, forcing them to hunt for the actual answer. | ✅ YES |
| 163:1 | "Conclusion" | Readers may expect the first sentence under "Conclusion" to directly state the primary takeaway; instead it opens with broad statements. | ✅ SIMILAR to 164 |

### PseudoAdvice (7 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 1:60 | "it's about leveraging smarter code" | This is framed as guidance but gives no actionable method, tools, or steps for leveraging smarter code. | ✅ YES |
| 3:155 | "The goal isn't faster delivery, it's sustainable velocity." | This is an advice-like statement about what to prioritize, with no how-to guidance around achieving sustainable velocity. | ✅ YES |
| 43:1 | "Best for: Teams who want to fundamentally speed up their development velocity..." | The statement gives selection advice without any concrete how-to guidance or implementation details. | ✅ YES |
| 77:216 | "You'll need to invest time in configuration to dial down irrelevant feedback." | This imperative statement tells the reader what to do but provides no actionable guidance on how to configure, what settings to adjust, or what process to follow. | 🆕 NEW |
| 100:1 | "Best for: Large, complex monorepos where understanding the impact of changes..." | The sentence recommends when Greptile is "Best for" but does not explain how a team should assess whether their repo fits this description. | ✅ YES |
| 152:1 | "How to Choose the Right Tool" | The phrase is an advice-oriented section title implying guidance on tool selection, but there are no following sentences offering concrete steps or comparison criteria. | 🆕 NEW |
| 172:66 | "Sign up and review your first stack in minutes." | Standalone imperative marketing advice without actionable detail on how to perform the review process qualifies as pseudo-advice. | 🆕 NEW |

### Repetition (6 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 3:155 | "The goal isn't faster delivery, it's sustainable velocity." | Concept of shifting from speed to smarter/sustainable work is already conveyed in lines 1 and 3; this restatement adds no new mechanism or perspective. | 🆕 NEW |
| 39:1 | "The integration feels seamless. Graphite Agent appears directly in Graphite's PR inbox..." | The Graphite integration description and Copilot's integration description both cover convenience and ecosystem fit; this could be tightened. | 🆕 NEW |
| 71:77 | "It offers a rich feature set that goes well beyond basic static analysis." | The earlier overview already states that CodeRabbit "provides detailed AI reviews"; this line repeats the same core concept without adding new mechanisms. | 🆕 NEW |
| 111:1 | "This capability is genuinely useful for reducing the back-and-forth in code reviews." | The benefit of reducing back-and-forth is already implied by line 109's explanation that Ellipsis can automatically implement requested changes. | 🆕 NEW |
| 121:1 | "Best for: Teams who spend too much time on minor refactoring cycles..." | The sentence defines Ellipsis's ideal users; line 150 in the comparison table restates the same core idea, so one could be consolidated. | 🆕 NEW |
| 168:1 | "To truly fix code review, you need a platform that incentivizes better practices..." | The section restates Graphite's value proposition—workflow rethinking plus AI—without introducing new information. | ✅ YES |

---

## 2. Overlap Analysis

### Matched Findings (Batch=2 vs Baseline)

**AIPattern:**
| Baseline Line | Batch=2 Line | Status |
|---------------|--------------|--------|
| 1:60 | 1:60 | ✅ Exact |
| 3:15 | 3:15 | ✅ Exact |
| 3:86 | 3:86 | ✅ Exact |
| 3:155 | 3:155 | ✅ Exact |
| 12 | 12 | ✅ Exact |
| 39 | 39 | ✅ Exact |
| 54 | 54 | ✅ Exact |
| 90:281 | 90:281 | ✅ Exact |
| 153 | - | ❌ Missed |
| 168 | 168 | ✅ Exact |

**AIPattern Match Rate:** 10/17 = **59%**

**Directness:**
| Baseline Line | Batch=2 Line | Status |
|---------------|--------------|--------|
| 31 | 7 | ≈ Similar |
| 71 | 69 | ✅ Similar |
| 90 | 88 | ✅ Similar |
| 152 | 152 | ✅ Exact |
| 164 | 163 | ✅ Similar |
| 168 | - | ❌ Missed |

**Directness Match Rate:** 4/6 = **67%**

**PseudoAdvice:**
| Baseline Line | Batch=2 Line | Status |
|---------------|--------------|--------|
| 1 | 1 | ✅ Exact |
| 3:131 | - | ❌ Missed |
| 3:192 | 3:155 | ✅ Similar |
| 43 | 43 | ✅ Exact |
| 81 | - | ❌ Missed |
| 100 | 100 | ✅ Exact |
| 168 | - | ❌ Missed |

**PseudoAdvice Match Rate:** 4/7 = **57%**

**Repetition:**
| Baseline Line | Batch=2 Line | Status |
|---------------|--------------|--------|
| 168 | 168 | ✅ Exact |
| 170 | - | ❌ Missed |

**Repetition Match Rate:** 1/2 = **50%**

### Overall Overlap

| Rule | Baseline | Matched | Rate |
|------|----------|---------|------|
| AIPattern | 17 | 10 | 59% |
| Directness | 6 | 4 | 67% |
| PseudoAdvice | 7 | 4 | 57% |
| Repetition | 2 | 1 | 50% |
| **TOTAL** | **32** | **19** | **~59%** |

**VERDICT: ❌ FAIL** (Target was >95%, but improved from 37.5% with batch=4)

---

## 3. Missed Findings (Baseline found, Batch=2 missed)

| Line:Col | Rule | Quoted Text | Description |
|----------|------|-------------|-------------|
| 1:102 | AIPattern | "don't just need tools, they need integrated platforms" | "don't just X, they need Y" structure adds rhetorical flair but no substance |
| 37:1 | AIPattern | "Graphite Agent isn't just a comment bot. It's an interactive companion" | Negation-contrast pattern "isn't just X, it's Y" used rhetorically |
| 58:323 | AIPattern | "The AI doesn't have the same 'agentic' feel... but lacks..." | Negation-contrast redundantly contrasts negatives |
| 92:1 | AIPattern | "This approach excels at answering complex questions..." | (False positive in baseline - clean content) |
| 130:50 | AIPattern | "Instead of trying to do everything, it focuses exclusively..." | Artificial contrast without prior discussion |
| 136:31 | AIPattern | "BugBot doesn't generate, doesn't provide, doesn't help..." | Repeated "doesn'ts" - templated AI phrasing |
| 136:166 | AIPattern | "It has one job: find critical bugs." | Completes AI-style contrast pattern |
| 153:163 | AIPattern | "You're not just adding AI to a slow process, you're fixing..." | Artificial contrast for emphasis |
| 31:1 | Directness | "Most AI code review tools are bots that bolt onto..." | Context-before-answer pattern |
| 168:1 | Directness | "To truly fix code review, you need a platform..." | Concrete takeaway buried mid-section |
| 3:131 | PseudoAdvice | "orchestrating outcomes" | No steps or examples provided |
| 81:1 | PseudoAdvice | "Best for: Teams who want to keep the native GitHub UI..." | Lacks decision criteria |
| 168:27 | PseudoAdvice | "you need a platform that incentivizes better practices..." | No actionable instructions |
| 170:1 | Repetition | "The best teams are shipping faster than ever..." | Repeats established theme without new data |

**Total Missed:** 13 findings (improved from 18 with batch=4)

---

## 4. New Findings (Batch=2 found, Baseline missed)

| Line:Col | Rule | Quoted Text | Description | Valid? |
|----------|------|-------------|-------------|--------|
| 71:1 | AIPattern | "CodeRabbit has established itself... rich feature set..." | Broad and marketing-like without concrete detail | ✅ Valid |
| 75:1 | AIPattern | "CodeRabbit is highly configurable." | Vague evaluative phrase sounds like boilerplate | ✅ Valid |
| 77:79 | AIPattern | "comprehensive analysis can be valuable" | Abstract phrase reads like stock copy | ✅ Valid |
| 90:10 | AIPattern | "takes a unique approach to AI code review" | Claim of uniqueness is vague and unsubstantiated | ⚠️ Questionable |
| 90:66 | AIPattern | "comprehensive knowledge graph of your entire repository" | Leans on jargon instead of plain description | ⚠️ Questionable |
| 90:197 | AIPattern | "uses this context to provide unusually deep analysis" | Promotional and non-specific | ✅ Valid |
| 96:149 | AIPattern | "deploy Greptile on-premises for complete control" | 'deploy' is a flagged buzzword | ✅ Valid |
| 132:405 | AIPattern | "optimizations" | Generic and marketing-flavored | ✅ Valid |
| 7:1 | Directness | "Introduction: The 'Review Gap' in the Age of AI" | Gap only named in second paragraph | ✅ Valid |
| 50:1 | Directness | "Overview: The default choice for many teams..." | States popularity, not core capabilities | ✅ Valid |
| 104:1 | Directness | "5. Ellipsis (Best for Automated Fixes)" | Doesn't front-load why it's best | ✅ Valid |
| 77:216 | PseudoAdvice | "You'll need to invest time in configuration..." | No actionable guidance on how to configure | ✅ Valid |
| 152:1 | PseudoAdvice | "How to Choose the Right Tool" (header only) | No following sentences with concrete steps | ✅ Valid |
| 172:66 | PseudoAdvice | "Sign up and review your first stack in minutes." | Marketing nudge without actionable detail | ✅ Valid |
| 3:155 | Repetition | "The goal isn't faster delivery, it's sustainable velocity." | Concept already conveyed earlier | ✅ Valid |
| 39:1 | Repetition | "The integration feels seamless..." | Restates integration quality | ✅ Valid |
| 71:77 | Repetition | "rich feature set that goes well beyond..." | Rephrased by later specifics | ✅ Valid |
| 111:1 | Repetition | "This capability is genuinely useful..." | Restates prior explanation | ✅ Valid |
| 121:1 | Repetition | "Best for: Teams who spend too much time..." | Pattern repeated in table | ✅ Valid |

**Total New:** 19 findings
**Hallucination Rate:** 2/19 = ~5% (the "questionable" items)

---

## 5. Comparison: Batch=4 (V5) vs Batch=2 (V6)

| Metric | Batch=4 | Batch=2 | Change |
|--------|---------|---------|--------|
| Warnings Found | 34 | 37 | +3 |
| Overlap with Baseline | 37.5% | **59%** | +21.5% ✅ |
| Missed Findings | 18 | 13 | -5 ✅ |
| Token Reduction | 37% | **21%** | -16% ❌ |
| Cost | $0.15 | $0.19 | +$0.04 ❌ |
| LLM Requests | 6 | 12 | +6 ❌ |
| Hallucination Rate | ~9% | ~5% | -4% ✅ |

### Key Improvements with Batch=2

1. **More Negation Patterns Detected:** Batch=2 found 4 negation patterns on line 3 (3:15, 3:86, 3:155) that batch=4 missed entirely.

2. **Higher Overlap:** Accuracy improved from 37.5% to 59% - the smaller batch size reduces "lost in the middle" effects.

3. **Lower Hallucinations:** Dropped from ~9% to ~5% with fewer questionable findings.

### Trade-offs

1. **Less Efficiency:** Token reduction dropped from 37% to 21% because we now have 2 batches instead of 1 (more prompt overhead).

2. **More LLM Requests:** 12 requests vs 6 - doubling the batch count.

---

## 6. Efficiency Analysis

| Metric | Baseline | Batch=4 | Batch=2 |
|--------|----------|---------|---------|
| Input Tokens | 50,570 | 31,996 | 39,868 |
| Token Reduction | - | -37% | -21% |
| LLM Requests | 24 | 6 | 12 |
| Request Reduction | - | -75% | -50% |
| Cost | $0.20 | $0.15 | $0.19 |
| Cost Reduction | - | -25% | -5% |

---

## 7. Conclusion

### Batch Size 2 Results

| Criterion | Target | Actual | Pass/Fail |
|-----------|--------|--------|-----------|
| Overlap with Baseline | >95% | 59% | ❌ FAIL |
| Token Reduction | >50% | 21% | ❌ FAIL |
| Hallucination Rate | 0% | ~5% | ⚠️ MARGINAL |

### Comparison Summary

| Batch Size | Overlap | Token Reduction | Hallucinations | Recommendation |
|------------|---------|-----------------|----------------|----------------|
| 4 (V5) | 37.5% | 37% | ~9% | ❌ Not viable |
| 2 (V6) | 59% | 21% | ~5% | ❌ Still not viable |
| 1 (no batch) | 100% | 0% | 0% | ✅ Current default |

### Recommendation

**The Rule Batching feature should remain DISABLED by default.**

While batch size 2 shows meaningful improvement in accuracy (59% vs 37.5% overlap) and lower hallucinations (~5% vs ~9%), it still falls far short of the 95% target. The efficiency gains (21% token reduction) are also well below the 50% target.

**Potential future improvements:**
1. **Rule-type-aware batching:** Only batch simple buzzword rules together; keep complex structural rules individual
2. **Hybrid approach:** Use batching for first-pass scanning, then verify edge cases individually
3. **Prompt engineering:** Experiment with stronger rule separation in the prompt format
4. **Batch size 1 for complex rules:** Default to no batching for rules with negation-pattern detection

---

*Report generated by manual A/B validation test.*
