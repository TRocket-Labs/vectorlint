import { existsSync, readFileSync } from 'fs';
import path from 'path';

const DEFAULT_DIRECTIVE = `
List every finding you detect.
- If the issue occurs within a sentence, the offending word or short phrase in your evidence (example: "leverage" is an AI buzzword).
- If a sentence contains multiple issues, report each as a separate violation using the same sentence attribution.

For each finding,
Provide anchors as exact 10–20 characters immediately before (pre) and after (post) the judged region; do not fabricate anchors. Include:
- pre: 10–20 exact characters immediately before the judged region, or empty string at start
- post: 10–20 exact characters immediately after the judged region, or empty string at end
- analysis: a specific, concrete explanation of the issue (respect word limit)
- suggestion: a succinct, imperative fix (max 15 words)
- When a criterion has no findings, provide one short positive remark describing compliance.

***Important*** 
- Use ONLY the provided ‘Input’ content to derive findings. Do not infer or hypothesize from examples or 
prior context. Every quoted snippet must be a verbatim substring of Input. Mentioning issues or quotes that don't exist
is equivalent to failure. 
- All quotes must be copy‑pasteable from Input; anchors must be raw
  characters before/after that exact substring. If none are found for a criterion, return an empty list
- Show your step-by-step reasoning towards accomplishing the task and justify that you successfully avoided halluncinating findings.`;

export function loadDirective(cwd: string = process.cwd()): string {
  // 1) Project override
  try {
    const overridePath = path.resolve(cwd, '.vectorlint/directive.md');
    if (existsSync(overridePath)) {
      return (readFileSync(overridePath, 'utf-8') || '').trim();
    }
  } catch {
    // Ignore errors when reading override file
  }

  // 2) Built-in string directive (no file copy required)
  return DEFAULT_DIRECTIVE.trim();
}
