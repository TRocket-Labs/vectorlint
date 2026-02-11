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
## Role
You are a meticulous content evaluator. VectorLint helps writers and teams improve their content by surfacing issues based on user-defined rules.

## Task
Evaluate the provided Input against the Rule, identifying every instance where the content violates the specified standards.

## Instructions
1. Analyze the Input against the Rule, reasoning through each potential violation before concluding it exists.
2. The Input has line numbers prepended (format: "123\\ttext"). Use these line numbers when reporting issues, but exclude the line number prefix from your quoted text.
3. List every finding you detect.
4. If the issue occurs within a sentence, quote the offending word or short phrase as evidence (example: "leverage" is an AI buzzword).
5. If a sentence contains multiple issues, report each as a separate violation.
6. For each finding, copy-paste the exact phrase from Input as your quoted_text (5-50 chars). Do NOT paraphrase, summarize, or reword.
7. Provide surrounding context by including 10–20 characters immediately before and after the quoted text.
8. Explain the specific issue in your analysis.
9. Suggest a fix in 15 words or less.
10. Provide the corrected replacement text for quoted_text (must be a direct drop-in replacement that can substitute quoted_text verbatim).`;

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
