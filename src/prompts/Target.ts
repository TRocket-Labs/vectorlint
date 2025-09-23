export interface TargetSpec {
  regex?: string;
  flags?: string;
  group?: number;
  required?: boolean;
  suggestion?: string;
}

export function checkTarget(
  content: string,
  metaTarget?: TargetSpec,
  criterionTarget?: TargetSpec
): { missing: boolean; suggestion?: string } {
  const tgt = criterionTarget ?? metaTarget;
  if (!tgt || !tgt.regex) return { missing: false };
  let match: RegExpExecArray | null = null;
  try {
    const flags = tgt.flags || 'mu';
    const re = new RegExp(tgt.regex, flags);
    match = re.exec(content);
  } catch {
    // invalid regex: treat as missing only if required
    return { missing: !!tgt.required, suggestion: tgt.suggestion };
  }
  if (!match) {
    return { missing: !!tgt.required, suggestion: tgt.suggestion };
  }
  return { missing: false };
}

