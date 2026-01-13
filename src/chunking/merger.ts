import type { CheckItem } from "../prompts/schema";

export function mergeViolations(
  chunkViolations: CheckItem[][]
): CheckItem[] {
  const all = chunkViolations.flat();

  // Deduplicate using composite key (quoted_text + description + analysis)
  const seen = new Set<string>();
  return all.filter((v) => {
    const key = [
      v.quoted_text?.toLowerCase().trim() || "",
      v.description?.toLowerCase().trim() || "",
      v.analysis?.toLowerCase().trim() || "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
