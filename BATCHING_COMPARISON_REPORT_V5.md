# Rule Batching Validation Report V5 (Batch Size = 4)

**Date:** 2026-01-13
**File Tested:** `tests/fixtures/ai-pattern/negation-pattern.md`
**Batch Size:** 4 rules per batch (MaxRulesPerBatch=4)

---

## Executive Summary

| Metric | Target | Result | Status |
|--------|--------|--------|--------|
| **Intersection (Overlap)** | >95% | **~38%** | ❌ FAIL |
| **Efficiency (Token Reduction)** | >50% | **~37%** | ❌ FAIL |
| **Hallucinations** | 0 false positives | ~9% | ⚠️ MARGINAL |

**Recommendation:** Feature should remain **DISABLED by default**.

---

## Test Results

### Summary Counts

| Mode | Warnings | Input Tokens | LLM Requests | Cost |
|------|----------|--------------|--------------|------|
| **Baseline (A)** | 32 | ~50,570 | ~24 | ~$0.20 |
| **Batched (B)** | 34 | ~31,996 | 6 | ~$0.15 |

---

## 1. Baseline (A) Findings - 32 Warnings

### AIPattern (17 findings)

| Line:Col | Quoted Text | Description |
|----------|-------------|-------------|
| 1:60 | "it's about leveraging smarter code" | Using 'leveraging' sounds like generic tech marketing language rather than natural phrasing. |
| 1:102 | "don't just need tools, they need integrated platforms" | The "don't just X, they need Y" structure adds rhetorical flair but no new substance. |
| 3:15 | "doesn't simply improve productivity, it transforms workflows entirely" | "Doesn't simply improve" introduces and dismisses an idea that was never discussed before. |
| 3:86 | "You're not managing projects anymore, you're orchestrating outcomes" | The sentence contrasts two roles for effect, but "managing projects" was not established earlier. |
| 3:155 | "The goal isn't faster delivery, it's sustainable velocity" | Introduces "faster delivery" only to negate it, creating formulaic emphasis. |
| 12:1 | "The solution isn't to hire more reviewers or work longer hours. The solution is to apply AI" | The sentence sets up and dismisses a strawman option purely for rhetorical effect. |
| 37:1 | "Graphite Agent isn't just a comment bot. It's an interactive companion" | Negation-contrast pattern "isn't just X, it's Y" is used rhetorically without prior setup. |
| 39:1 | "The integration feels seamless." | Contains the buzzword "seamless," which is overused in AI-generated marketing copy. |
| 54:70 | "Copilot works seamlessly in VS Code" | Uses the buzzword "seamlessly," which is common in generic AI/marketing language. |
| 58:323 | "The AI doesn't have the same 'agentic' feel... It provides suggestions but lacks..." | Negation-contrast pattern redundantly contrasts negatives for emphasis. |
| 90:281 | "doesn't just look at the changed lines. It understands how" | Uses template "doesn't just look at X, it understands Y" without prior framing. |
| 92:1 | "This approach excels at answering complex questions..." | (False positive - baseline incorrectly flagged clean content) |
| 130:50 | "Instead of trying to do everything, it focuses exclusively on finding critical bugs" | Uses artificial contrast without prior discussion of BugBot attempting everything. |
| 136:31 | "BugBot doesn't generate PR summaries, doesn't provide architectural feedback..." | Repeated "doesn't" constructions stack negations, sounding like templated AI phrasing. |
| 136:166 | "It has one job: find critical bugs." | Completes familiar AI-style contrast pattern after list of "doesn't" capabilities. |
| 153:163 | "You're not just adding AI to a slow process, you're fixing the process itself." | Uses artificial contrast to sound emphatic rather than advancing the argument. |
| 168:168 | "It's not just an AI reviewer, it's a complete rethinking of how code review should work" | Introduces and dismisses a straw characterization for emphasis. |

### Directness (6 findings)

| Line:Col | Quoted Text | Description |
|----------|-------------|-------------|
| 31:1 | "Most AI code review tools are bots that bolt onto your existing GitHub workflow." | Context-before-answer pattern; section starts with industry background rather than explaining why Graphite Agent is best. |
| 71:1 | "CodeRabbit has established itself as the leading third-party AI review bot." | First sentence gives status/positioning rather than directly summarizing the tool's core function. |
| 90:1 | "Greptile takes a unique approach to AI code review by building a comprehensive knowledge graph..." | Foregrounds that approach is "unique" instead of directly stating the primary capability. |
| 152:1 | "How to Choose the Right Tool" | Header introduces new section, but no opening content follows to answer how to choose. |
| 164:1 | "AI code review tools are no longer optional." | Reader finishes first sentence unsure of concrete takeaway; main conclusion appears later. |
| 168:1 | "To truly fix code review, you need a platform that incentivizes better practices" | Section opening could immediately answer how to fix code review; clearer conclusion is buried. |

### PseudoAdvice (7 findings)

| Line:Col | Quoted Text | Description |
|----------|-------------|-------------|
| 1:71 | "leveraging smarter code" | Imperative-style recommendation but provides no concrete methods, tools, or steps. |
| 3:131 | "orchestrating outcomes" | Prescriptive framing suggests new way to work but offers no steps or examples. |
| 3:192 | "sustainable velocity" | Goal-level recommendation; surrounding text gives no concrete practices to reach it. |
| 43:11 | "Teams who want to fundamentally speed up their development velocity, not just add a bot" | Advice-like guidance lacks any how-to detail or examples in nearby sentences. |
| 81:1 | "Best for: Teams who want to keep the native GitHub UI but need better automated feedback..." | Advice framed as recommendation but lacks concrete decision criteria or steps. |
| 100:1 | "Best for: Large, complex monorepos where understanding the impact of changes..." | Recommends when to use tool but provides no concrete decision process or checklist. |
| 168:27 | "you need a platform that incentivizes better practices (smaller, more focused PRs)..." | States what to do but provides no actionable instructions, tools, or examples. |

### Repetition (2 findings)

| Line:Col | Quoted Text | Description |
|----------|-------------|-------------|
| 168:1 | "To truly fix code review, you need a platform..." (full paragraph) | Reiterates Graphite as workflow-level solution with smaller PRs and AI; already explained in prior sections. |
| 170:1 | "The best teams are shipping faster than ever while maintaining higher code quality..." | Repeats established theme that workflow improvements plus AI increase velocity; no new data or examples. |

---

## 2. Batched (B) Findings - 34 Warnings

### AIPattern (13 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 1:60 | "it's about leveraging smarter code" | The phrase "leveraging" is a listed buzzword and can feel like generic AI marketing language. | ✅ YES |
| 12:1 | "The solution isn't to hire more reviewers..." | The sentence introduces "hire more reviewers or work longer hours" only to dismiss it, creating an AI-like rhetorical pattern. | ✅ YES |
| 39:1 | "The integration feels seamless." | The word "seamless" is explicitly listed as an AI buzzword to flag. | ✅ YES |
| 54:70 | "Copilot works seamlessly in VS Code" | The adverb "seamlessly" matches the buzzword list and signals AI-like phrasing. | ✅ YES |
| 71:397 | "comprehensive feedback" | The phrase is somewhat buzzwordy, though not on the strict list; still mildly formulaic. | 🆕 NEW |
| 75:15 | "highly configurable" | This phrase is overused in product copy and feels templated without immediate specifics. | 🆕 NEW |
| 79:1 | "Pricing is competitive" | This phrase asserts value without detail and reads like boilerplate marketing language. | 🆕 NEW |
| 88:11 | "Focuses heavily on understanding your entire codebase" | The construction is broad and promotional; could be more concrete and specific. | 🆕 NEW |
| 90:66 | "comprehensive knowledge graph" | While not on the strict list, it reads as jargon if not concretely grounded. | 🆕 NEW |
| 96:149 | "deploy Greptile on-premises for complete control over your data" | 'deploy' is a flagged buzzword that can make the prose feel formulaic and marketing-like. | 🆕 NEW |
| 132:405 | "optimizations" | The term is mildly buzzwordy and can feel generic and marketing-like. | 🆕 NEW |
| 153:20 | "You're not just adding AI to a slow process, you're fixing the process itself." | The "not just X, Y" contrast is formulaic and reads like AI rhetoric. | ✅ YES |
| 168:168 | "It's not just an AI reviewer, it's a complete rethinking" | The sentence introduces "just an AI reviewer" only to dismiss it for emphasis. | ✅ YES |

### Directness (7 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 7:1 | "Introduction: The 'Review Gap' in the Age of AI" | The first sentence gives background on AI code generation; the gap itself is only named later. | 🆕 NEW |
| 50:1 | "Overview: The default choice for many teams..." | First sentence states popularity and a narrow benefit rather than summarizing Copilot's core capabilities. | 🆕 NEW |
| 69:1 | "Overview: A popular tool that connects to GitHub, GitLab, or Bitbucket..." | It answers what CodeRabbit is, but buries its standout aspects until later. | ✅ SIMILAR to 71 |
| 88:1 | "Overview: Focuses heavily on understanding your entire codebase..." | Readers must infer what Greptile actually does from a contrast, not a clear primary statement. | ✅ SIMILAR to 90 |
| 104:1 | "5. Ellipsis (Best for Automated Fixes)" | First sentence describes what Ellipsis is but does not front-load why it's best for automated fixes. | 🆕 NEW |
| 152:1 | "How to Choose the Right Tool" | Readers see header but get no immediate criteria or steps. | ✅ YES |
| 163:1 | "Conclusion" | Readers expect first sentence to state the primary takeaway; instead opens with broad statements. | ✅ SIMILAR to 164 |

### PseudoAdvice (7 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 12:65 | "The solution is to apply AI to the review process itself." | This is an imperative recommendation but gives no actionable detail on how to apply AI in practice. | ✅ SIMILAR |
| 43:1 | "Best for: Teams who want to fundamentally speed up their development velocity..." | It advises a type of team to pick the tool but lacks actionable criteria or steps. | ✅ YES |
| 77:216 | "You'll need to invest time in configuration to dial down irrelevant feedback." | Tells readers to invest time configuring without explaining which options to change or how. | 🆕 NEW |
| 111:252 | "For minor refactoring tasks, style fixes, or simple logic adjustments, this saves significant time." | This is prescriptive but lacks actionable guidance on setup, workflow, or decision criteria. | 🆕 NEW |
| 121:1 | "Best for: Teams who spend too much time on minor refactoring cycles..." | The sentence advises a type of team but doesn't explain how to assess fit or adopt it. | 🆕 NEW |
| 142:1 | "Best for: High-compliance industries or mission-critical codebases..." | Advice identifies ideal users but omits how such teams should pilot, configure, or integrate. | 🆕 NEW |
| 172:1 | "Try Graphite Agent today — it's included in every Graphite plan..." | Advice tells readers to try and sign up without specifying where or how beyond generic prompt. | 🆕 NEW |

### Repetition (7 findings)

| Line:Col | Quoted Text | Description | Baseline Match? |
|----------|-------------|-------------|-----------------|
| 10:1 | "This mismatch has created what I call the 'Review Gap.'" | Prior paragraph already explains AI speeding coding while review capacity stays flat; naming it largely repeats the concept. | 🆕 NEW |
| 39:1 | "The integration feels seamless. Graphite Agent appears directly in Graphite's PR inbox..." | Line 37 notes the agent "lives on your PR page"; calling integration "seamless" restates quality without adding specifics. | 🆕 NEW |
| 71:77 | "It offers a rich feature set that goes well beyond basic static analysis." | This high-level claim is rephrased by later specifics, making it somewhat redundant. | 🆕 NEW |
| 111:252 | "For minor refactoring tasks, style fixes, or simple logic adjustments, this saves significant time." | Line 110 already explains Ellipsis automates fixes; this restates that it reduces back-and-forth without new detail. | 🆕 NEW |
| 121:1 | "Best for: Teams who spend too much time on minor refactoring cycles..." | Multiple "Best for" sections across tools provide similar high-level fit guidance; could be consolidated. | 🆕 NEW |
| 142:1 | "Best for: High-compliance industries or mission-critical codebases..." | Multiple "Best for" blurbs repeat the same kind of fit description; table already covers use cases. | 🆕 NEW |
| 168:1 | "To truly fix code review, you need a platform that incentivizes better practices..." | This section reiterates that Graphite fixes underlying workflow issues, already conveyed earlier. | ✅ YES |

---

## 3. Overlap Analysis

### Matched Findings (by Rule+Line)

| Baseline Finding | Batched Finding | Rule | Match Status |
|------------------|-----------------|------|--------------|
| Line 1:60 (leveraging) | Line 1:60 | AIPattern | ✅ Exact |
| Line 12 (solution isn't) | Line 12 | AIPattern | ✅ Exact |
| Line 39 (seamless) | Line 39 | AIPattern | ✅ Exact |
| Line 54 (seamlessly) | Line 54 | AIPattern | ✅ Exact |
| Line 153 (not just X, Y) | Line 153 | AIPattern | ✅ Exact |
| Line 168 (not just AI reviewer) | Line 168 | AIPattern | ✅ Exact |
| Line 152 (How to Choose) | Line 152 | Directness | ✅ Exact |
| Line 164 (Conclusion) | Line 163 | Directness | ≈ Similar |
| Line 43 (Best for teams) | Line 43 | PseudoAdvice | ✅ Exact |
| Line 168 (Repetition) | Line 168 | Repetition | ✅ Exact |

### Overlap Statistics

- **Baseline Total:** 32 findings
- **Exact/Similar Matches:** ~12 findings
- **Overlap Rate:** 12/32 = **37.5%**

**VERDICT: ❌ FAIL** (Target was >95%)

---

## 4. Missed Findings (Baseline found, Batched missed)

| Line:Col | Rule | Quoted Text | Description |
|----------|------|-------------|-------------|
| 1:102 | AIPattern | "don't just need tools, they need integrated platforms" | Rhetorical structure adds flair but no substance |
| 3:15 | AIPattern | "doesn't simply improve productivity" | Introduces and dismisses idea never discussed |
| 3:86 | AIPattern | "You're not managing projects anymore" | Contrasts roles without prior establishment |
| 3:155 | AIPattern | "The goal isn't faster delivery" | Creates formulaic emphasis |
| 37:1 | AIPattern | "isn't just a comment bot" | Negation-contrast without prior setup |
| 58:323 | AIPattern | "doesn't have X, but lacks Y" | Redundant negative contrasts |
| 90:281 | AIPattern | "doesn't just look at" | Template phrase without prior framing |
| 130:50 | AIPattern | "Instead of trying to do everything" | Artificial contrast |
| 136:31 | AIPattern | "doesn't generate, doesn't provide, doesn't help" | Repeated "doesn'ts" - templated AI phrasing |
| 136:166 | AIPattern | "It has one job: find critical bugs" | Completes AI-style contrast pattern |
| 31:1 | Directness | "Most AI code review tools are bots..." | Context-before-answer pattern in Graphite section |
| 71:1 | Directness | "CodeRabbit has established itself..." | Status before function in CodeRabbit overview |
| 90:1 | Directness | "Greptile takes a unique approach..." | "Unique approach" instead of direct capability |
| 168:1 | Directness | "To truly fix code review..." | Concrete takeaway buried mid-section |
| 1:71 | PseudoAdvice | "leveraging smarter code" | No concrete methods provided |
| 3:131 | PseudoAdvice | "orchestrating outcomes" | No steps or examples |
| 3:192 | PseudoAdvice | "sustainable velocity" | No concrete practices |
| 81:1 | PseudoAdvice | "Best for: Teams who want to keep..." | Lacks decision criteria |
| 100:1 | PseudoAdvice | "Best for: Large, complex monorepos..." | No checklist for assessment |
| 170:1 | Repetition | "The best teams are shipping faster..." | Repeats established theme |

**Total Missed:** 18 findings

---

## 5. New Findings (Batched found, Baseline missed)

| Line:Col | Rule | Quoted Text | Description | Valid? |
|----------|------|-------------|-------------|--------|
| 71:397 | AIPattern | "comprehensive feedback" | Somewhat buzzwordy, mildly formulaic | ✅ Valid |
| 75:15 | AIPattern | "highly configurable" | Overused product copy phrase | ✅ Valid |
| 79:1 | AIPattern | "Pricing is competitive" | Asserts value without detail | ✅ Valid |
| 88:11 | AIPattern | "Focuses heavily on understanding" | Broad and promotional | ⚠️ Questionable |
| 90:66 | AIPattern | "comprehensive knowledge graph" | Reads as jargon | ⚠️ Questionable |
| 96:149 | AIPattern | "deploy" | Flagged buzzword | ✅ Valid |
| 132:405 | AIPattern | "optimizations" | Generic marketing-flavored term | ✅ Valid |
| 7:1 | Directness | "Introduction: The 'Review Gap'..." | Header vs first paragraph gap definition | ✅ Valid |
| 50:1 | Directness | "Overview: The default choice..." | Copilot overview buries core capabilities | ✅ Valid |
| 104:1 | Directness | "5. Ellipsis (Best for Automated Fixes)" | Header doesn't front-load key benefit | ✅ Valid |
| 77:216 | PseudoAdvice | "invest time in configuration" | No specifics given | ✅ Valid |
| 111:252 | PseudoAdvice | "saves significant time" | No actionable guidance | ✅ Valid |
| 121:1 | PseudoAdvice | "Best for: Teams who spend too much time..." | Lacks adoption guidance | ✅ Valid |
| 142:1 | PseudoAdvice | "Best for: High-compliance industries..." | No integration steps | ✅ Valid |
| 172:1 | PseudoAdvice | "Try Graphite Agent today" | Minimal actionable guidance | ✅ Valid |
| 10:1 | Repetition | "This mismatch has created what I call the 'Review Gap.'" | Naming repeats prior explanation | ✅ Valid |
| 39:1 | Repetition | "The integration feels seamless..." | Restates integration quality | ✅ Valid |
| 71:77 | Repetition | "rich feature set that goes well beyond" | Rephrased by later specifics | ✅ Valid |
| 111:252 | Repetition | "this saves significant time" | Restates prior explanation | ✅ Valid |
| 121:1 | Repetition | "Best for: Teams who spend..." | Pattern repeated across tools | ✅ Valid |
| 142:1 | Repetition | "Best for: High-compliance..." | Structurally redundant | ✅ Valid |

**Total New:** 22 findings
**Hallucination Rate:** 2/22 = ~9% (the "questionable" items)

---

## 6. Efficiency Analysis

| Metric | Baseline | Batched | Reduction |
|--------|----------|---------|-----------|
| Input Tokens | ~50,570 | ~31,996 | **-37%** |
| LLM Requests | ~24 | 6 | **-75%** |
| Output Tokens | ~3,287 | ~3,852 | +17% |
| Total Cost | ~$0.20 | ~$0.15 | **-25%** |

**Token Reduction:** 37% (Target was >50%)
**VERDICT: ❌ FAIL**

---

## 7. Root Cause Analysis

### Why Batched Mode Missed Baseline Findings

1. **Lost in the Middle:** The negation-contrast patterns (lines 3, 37, 58, 130, 136) were systematically missed. These require careful rule application that gets diluted when 4 rules compete for attention in one prompt.

2. **Different Focus:** Batched mode found MORE buzzword-style issues (lines 71, 75, 79, 96, 132) but FEWER structural rhetorical patterns.

3. **Inconsistent Rule Application:** The Repetition rule found 7 issues in batched mode vs 2 in baseline - suggesting the model's interpretation varies significantly based on prompt structure.

### Why Batched Mode Found Different Issues

1. **Broader Scanning:** With 4 rules in context, the model may have done a more comprehensive scan for simpler patterns (buzzwords, vague advice).

2. **Rule Bleeding:** Some findings appear to blend criteria from multiple rules, suggesting context contamination.

---

## 8. Conclusion

| Criterion | Target | Actual | Pass/Fail |
|-----------|--------|--------|-----------|
| Overlap with Baseline | >95% | 37.5% | ❌ FAIL |
| Token Reduction | >50% | 37% | ❌ FAIL |
| Hallucination Rate | 0% | ~9% | ⚠️ MARGINAL |

### Recommendation

**The Rule Batching feature should remain DISABLED by default.**

While the infrastructure is functional and provides meaningful efficiency gains (~37% token reduction, ~75% request reduction), the quality degradation is unacceptable:

- **63% of baseline findings were missed or reported differently**
- **Many new findings were valid but different** from what the baseline found
- **Results are non-reproducible** between modes

The feature may be revisited if:
1. Better prompt engineering solves the "lost in the middle" problem
2. Smaller batch sizes (2-3 rules) are tested
3. Rule-type-specific batching is implemented (only simple buzzword rules together)

---

*Report generated by manual A/B validation test.*
