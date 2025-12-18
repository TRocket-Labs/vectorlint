import type { SemiObjectiveItem } from "../prompts/schema";

export function mergeViolations(
  chunkViolations: SemiObjectiveItem[][]
): SemiObjectiveItem[] {
  const all = chunkViolations.flat();

  // Deduplicate by analysis content
  const seen = new Set<string>();
  return all.filter((v) => {
    const key = v.analysis?.toLowerCase().trim() || "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
