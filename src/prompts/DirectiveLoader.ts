import { existsSync, readFileSync } from 'fs';
import path from 'path';

/**
 * Load a directive to append to evaluation prompts.
 * Precedence:
 * 1) Project override: .vectorlint/directive.md in current working directory
 * 2) Built-in: prompts/directive.md shipped with the CLI
 * Returns empty string if none found or on read error.
 */
const DEFAULT_DIRECTIVE = `
List every finding you detect.
- If the issue occurs within a sentence, the offending word or short phrase in your evidence (example: "leverage" is an AI buzzword).
- If a sentence contains multiple issues, report each as a separate violation using the same sentence attribution.

For each finding, 
Provide pre/post as the exact 10–20 characters immediately around the quoted snippet; do not fabricate anchors. Include:
- quote: the exact snippet you are evaluating (word/sentence/paragraph/section)
- pre: 10–20 exact characters immediately before the quote, or empty string
- post: 10–20 exact characters immediately after the quote, or empty string
- suggestion: a succinct, imperative fix (max 15 words).

When a criterion has no findings, provide one short positive remark describing compliance.`;

export function loadDirective(cwd: string = process.cwd()): string {
  // 1) Project override
  try {
    const overridePath = path.resolve(cwd, '.vectorlint/directive.md');
    if (existsSync(overridePath)) {
      return (readFileSync(overridePath, 'utf-8') || '').trim();
    }
  } catch {}

  // 2) Built-in string directive (no file copy required)
  return DEFAULT_DIRECTIVE.trim();
}
