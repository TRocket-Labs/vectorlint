import type { ReviewItem, ScoredReview } from "../prompts/schema";
import { Severity } from "../review/severity";

export interface ScoringOptions {
  strictness?: number | "lenient" | "strict" | "standard" | undefined;
  defaultSeverity?: typeof Severity.WARNING | typeof Severity.ERROR | undefined;
  promptSeverity?: typeof Severity.WARNING | typeof Severity.ERROR | undefined;
}

function resolveStrictness(
  config: number | "lenient" | "strict" | "standard" | undefined
): number {
  if (typeof config === "number") {
    return config;
  }
  switch (config) {
    case "lenient":
      return 5;
    case "strict":
      return 20;
    case "standard":
    default:
      return 10;
  }
}

/**
 * Calculates a score from violation density.
 *
 * Formula: Score = (100 - (violations/wordCount * 100 * strictness)) / 10
 */
export function calculateScore(
  violations: ReviewItem[],
  wordCount: number,
  options: ScoringOptions = {}
): ScoredReview {
  const strictness = resolveStrictness(options.strictness);
  const mappedViolations = violations.map((item) => ({
    ...item,
    ...(item.description !== undefined ? { criterionName: item.description } : {}),
  }));
  const density = (mappedViolations.length / wordCount) * 100;
  const rawScore = Math.max(0, Math.min(100, 100 - density * strictness));
  const finalScore = rawScore / 10;

  let severity: typeof Severity.WARNING | typeof Severity.ERROR = Severity.WARNING;
  if (finalScore < 10) {
    if (options.promptSeverity !== undefined) {
      severity = options.promptSeverity;
    } else if (options.defaultSeverity) {
      severity = options.defaultSeverity;
    }
  }

  const message =
    mappedViolations.length > 0
      ? `Found ${mappedViolations.length} issue${mappedViolations.length > 1 ? "s" : ""}`
      : "No issues found";

  return {
    final_score: Number(finalScore.toFixed(1)),
    percentage: Number(rawScore.toFixed(1)),
    violation_count: mappedViolations.length,
    items: violations,
    message,
    violations: mappedViolations,
    severity,
  };
}
