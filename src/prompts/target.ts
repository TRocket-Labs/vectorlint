// Re-export the schema-defined type
export type { TargetSpec } from '../schemas/prompt-schemas';

import type { TargetSpec } from '../schemas/prompt-schemas';

export function checkTarget(
  content: string,
  target?: TargetSpec,
): { missing: boolean; suggestion?: string | undefined } {
  if (!target || !target.regex) return { missing: false };
  let match: RegExpExecArray | null = null;
  try {
    const flags = target.flags || 'mu';
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
