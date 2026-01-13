import { existsSync, readFileSync } from "fs";
import path from "path";

/**
 * Load a directive to append to evaluation prompts.
 * Precedence:
 * 1) Project override: .vectorlint/directive.md in current working directory
 * 2) Built-in: prompts/directive.md shipped with the CLI
 * Returns empty string if none found or on read error.
 */
const DEFAULT_DIRECTIVE = `
List every finding you detect.
- If the issue occurs within a sentence, quote the offending word or short phrase as evidence.
- If a sentence contains multiple issues, report each as a separate violation.

**IMPORTANT**: The input has line numbers prepended (format: "123\\ttext"). Use these line numbers when reporting issues.

For each finding, provide:
- line: The line number where the issue appears (from the prepended line numbers in Input)
- quoted_text: COPY-PASTE the exact phrase from 'Input' (5-50 chars). Do NOT paraphrase, summarize, or reword. 
  The text must exist verbatim in 'Input' as a direct substring (excluding the line number prefix).
- context_before: 10–20 exact characters immediately before quoted_text (or empty string if at start)
- context_after: 10–20 exact characters immediately after quoted_text (or empty string if at end)
- issue: The problem (NEVER include the quoted_text here). Aim for 5-12 words.
- message: The user-facing output. Format based on scope:
  - WORD-level (buzzwords, specific terms): "quoted_text" + issue → e.g., "ensure" is a common AI buzzword
  - SENTENCE/SECTION/DOCUMENT-level: issue only → e.g., Opens with meta-commentary
- suggestion: a succinct, imperative fix
- When a criterion has no findings, provide one short positive remark describing compliance.

**MESSAGE EXAMPLES** (follow this style exactly):

WORD-level (quoted_text is 1-4 words) — message INCLUDES quoted_text:
✓ quoted_text: "ensure" → message: "ensure" is a common AI buzzword
✓ quoted_text: "game-changer" → message: "game-changer" is a buzzword phrase

SENTENCE-level (quoted_text is >4 words) — message does NOT include quoted_text:
✓ quoted_text: "LLM-based chunking uses a large language model..." → message: Buzzword-heavy sentence
✓ quoted_text: "In this article, we will explore..." → message: Opens with meta-commentary

SECTION-level — message references section names:
✓ message: Overlaps with "What is Chunking?" on context

**CRITICAL: If quoted_text is longer than 4 words, do NOT include it in the message.**


***CRITICAL RULES***
1. Go through the Input before anything else, and show your step-by-step reasoning or the approach you'll take to accomplish the task.
2. Every quoted_text MUST be a direct copy-paste from 'Input'. Before reporting, verify you can find that exact substring.
3. If you cannot find a verbatim match in 'Input', do NOT report it - skip that finding entirely.
4. Do NOT infer or hypothesize issues. Only report what you can directly quote from 'Input'.
5. Fabricating quotes that don't exist in 'Input' is equivalent to failure.
6. The line number you report must match the prepended number on that line in Input.
7. When comparing/contrasting sections, ALWAYS name the sections. NEVER say "both sections" without naming them.`;

export function loadDirective(cwd: string = process.cwd()): string {
  // 1) Project override
  try {
    const overridePath = path.resolve(cwd, ".vectorlint/directive.md");
    if (existsSync(overridePath)) {
      return (readFileSync(overridePath, "utf-8") || "").trim();
    }
  } catch {
    // Ignore errors when reading override file
  }

  // 2) Built-in string directive (no file copy required)
  return DEFAULT_DIRECTIVE.trim();
}
