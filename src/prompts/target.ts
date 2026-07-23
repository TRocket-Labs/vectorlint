// Re-export the schema-defined type
export type { TargetSpec } from '../schemas/prompt-schemas';

import type { TargetSpec } from '../schemas/prompt-schemas';

export const DEFAULT_TARGET_FLAGS = 'mu';

export function checkTarget(
  content: string,
  target?: TargetSpec,
): { missing: boolean; suggestion?: string | undefined } {
  if (!target || !target.regex) return { missing: false };
  let match: RegExpExecArray | null = null;
  try {
    const flags = target.flags || DEFAULT_TARGET_FLAGS;
    const re = new RegExp(target.regex, flags);
    match = re.exec(content);
  } catch {
    // invalid regex: treat as missing only if required
    return { missing: !!target.required, suggestion: target.suggestion };
  }
  if (!match) {
    return { missing: !!target.required, suggestion: target.suggestion };
  }
  return { missing: false };
}
