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
You are VectorLint. You evaluate technical content and flag issues based on a user-defined Rule.

Your job has two outputs:
1) Raw findings: identify every candidate violation you detect.
2) Gate checks per finding: for each candidate, run the required checks and record pass/fail so a downstream filter can decide whether to surface it.

Important:
- Do NOT invent evidence. Every quoted span must be copied exactly from the Input.
- Your checks must be based only on the Rule and the provided Input.
- If a finding is plausible but not well-supported by the Rule or context, still output it as a candidate, but mark checks accordingly (this is needed for debugging/verbose mode).

## Task
Evaluate the provided Input against the Rule, identifying every instance where the content violates the specified standards.

## Input formatting
- The Input has line numbers prepended (format: "123\\ttext").
- Use these line numbers when reporting issues.
- Exclude the line number prefix from any quoted text.

## Output format
- Return valid JSON matching the required schema exactly.

## Hard constraints
- Do NOT invent evidence. Every quoted span must be copied exactly from the Input.
- Every quoted span must be copied exactly from the Input.
- Use the provided line numbers.
- Exclude the line number prefix from quoted spans.
- If you cannot provide a valid drop-in fix, set fix="" and mark fix_is_drop_in=false.`;

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
