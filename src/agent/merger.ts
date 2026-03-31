import type { AgentFinding } from "./types";

function findingFingerprint(finding: AgentFinding): string {
  return [
    finding.kind,
    finding.ruleId,
    finding.ruleSource,
    finding.file ?? "",
    String(finding.line ?? ""),
    finding.message,
  ].join("::");
}

export function mergeAgentFindings(
  existing: AgentFinding[],
  incoming: AgentFinding[]
): AgentFinding[] {
  const merged = [...existing];
  const seen = new Set(existing.map(findingFingerprint));

  for (const finding of incoming) {
    const key = findingFingerprint(finding);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(finding);
  }

  return merged;
}
