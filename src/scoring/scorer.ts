import type {
  SemiObjectiveResult,
  SubjectiveResult,
  SemiObjectiveItem,
  SubjectiveLLMResult,
} from "../prompts/schema";
import { EvaluationType, Severity } from "../evaluators/types";

export interface SemiObjectiveScoringOptions {
  // Strictness factor. Higher = more penalty per violation.
  strictness?: number | "lenient" | "strict" | "standard" | undefined;
  defaultSeverity?: typeof Severity.WARNING | typeof Severity.ERROR | undefined;
  promptSeverity?:
    | typeof Severity.WARNING
    | typeof Severity.ERROR
    | string
    | undefined;
}

export interface SubjectiveScoringOptions {
  promptCriteria?:
    | Array<{ name: string; weight?: number | undefined }>
    | undefined;
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
 * Calculates semi-objective score based on violation density.
 *
 * Formula: Score = (100 - (violations/wordCount * 100 * strictness)) / 10
 */
export function calculateSemiObjectiveScore(
  violations: SemiObjectiveItem[],
  wordCount: number,
  options: SemiObjectiveScoringOptions = {}
): SemiObjectiveResult {
  const strictness = resolveStrictness(options.strictness);

  // Map items to violation format
  const mappedViolations = violations.map((item) => ({
    analysis: item.analysis,
    ...(item.suggestion && { suggestion: item.suggestion }),
    ...(item.pre && { pre: item.pre }),
    ...(item.post && { post: item.post }),
    criterionName: item.description,
  }));

  // Density Calculation: Violations per 100 words
  const density = (mappedViolations.length / wordCount) * 100;

  // Score Calculation: 100 - (Density * Strictness), clamped 0-100
  const rawScore = Math.max(0, Math.min(100, 100 - density * strictness));
  const finalScore = rawScore / 10;

  // Determine severity
  let severity: typeof Severity.WARNING | typeof Severity.ERROR =
    Severity.WARNING;

  if (finalScore < 10) {
    if (options.promptSeverity === Severity.ERROR) {
      severity = Severity.ERROR;
    } else if (options.defaultSeverity) {
      severity = options.defaultSeverity;
    }
  }

  const message =
    mappedViolations.length > 0
      ? `Found ${mappedViolations.length} issue${
          mappedViolations.length > 1 ? "s" : ""
        }`
      : "No issues found";

  return {
    type: EvaluationType.SEMI_OBJECTIVE,
    final_score: Number(finalScore.toFixed(1)),
    percentage: Number(rawScore.toFixed(1)),
    passed_count: 0,
    total_count: mappedViolations.length,
    items: violations,
    message,
    violations: mappedViolations,
    severity,
  };
}

/**
 * Calculates subjective score from criteria results.
 *
 * Each criterion score (1-4) is normalized to 1-10 scale,
 * then weighted average is calculated.
 */
export function calculateSubjectiveScore(
  criteria: SubjectiveLLMResult["criteria"],
  options: SubjectiveScoringOptions = {}
): SubjectiveResult {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  const criteriaWithCalculations = criteria.map((c) => {
    // Find weight from prompt definition
    const definedCriterion = options.promptCriteria?.find(
      (dc) => dc.name === c.name
    );
    const weight = definedCriterion?.weight || 1;

    // Normalize 1-4 score to 1-10 scale
    const normalizedScore = 1 + ((c.score - 1) / 3) * 9;
    const weightedPoints = normalizedScore * weight;

    totalWeightedScore += weightedPoints;
    totalWeight += weight;

    return {
      ...c,
      weight,
      normalized_score: Number(normalizedScore.toFixed(2)),
      weighted_points: Number(weightedPoints.toFixed(2)),
    };
  });

  const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 1;

  return {
    type: EvaluationType.SUBJECTIVE,
    final_score: Number(finalScore.toFixed(1)),
    criteria: criteriaWithCalculations,
  };
}

// Averages subjective scores from multiple chunk evaluations.
export function averageSubjectiveScores(
  results: SubjectiveResult[],
  chunkWordCounts: number[]
): SubjectiveResult {
  if (results.length === 0) {
    return {
      type: EvaluationType.SUBJECTIVE,
      final_score: 0,
      criteria: [],
    };
  }

  const totalWords = chunkWordCounts.reduce((a, b) => a + b, 0);

  // Aggregate criteria scores weighted by chunk size
  const criteriaMap = new Map<
    string,
    {
      totalScore: number;
      totalWeight: number;
      weight: number;
      violations: Array<{
        pre: string;
        post: string;
        analysis: string;
        suggestion: string;
      }>;
      summaries: string[];
      reasonings: string[];
    }
  >();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const chunkWeight =
      totalWords > 0
        ? (chunkWordCounts[i] || 0) / totalWords
        : 1 / results.length;

    for (const criterion of result?.criteria || []) {
      if (!criteriaMap.has(criterion.name)) {
        criteriaMap.set(criterion.name, {
          totalScore: 0,
          totalWeight: 0,
          weight: criterion.weight || 1,
          violations: [],
          summaries: [],
          reasonings: [],
        });
      }

      const entry = criteriaMap.get(criterion.name)!;
      entry.totalScore += criterion.score * chunkWeight;
      entry.totalWeight += chunkWeight;

      // Collect violations with required fields
      for (const v of criterion.violations || []) {
        entry.violations.push({
          pre: v.pre || "",
          post: v.post || "",
          analysis: v.analysis || "",
          suggestion: v.suggestion || "",
        });
      }

      if (criterion.summary) {
        entry.summaries.push(criterion.summary);
      }
      if (criterion.reasoning) {
        entry.reasonings.push(criterion.reasoning);
      }
    }
  }

  // Build aggregated criteria
  const aggregatedCriteria: SubjectiveResult["criteria"] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [name, entry] of Array.from(criteriaMap.entries())) {
    const avgScore =
      entry.totalWeight > 0 ? entry.totalScore / entry.totalWeight : 0;
    const roundedScore = Math.max(1, Math.min(4, Math.round(avgScore))) as
      | 1
      | 2
      | 3
      | 4;
    const normalizedScore = 1 + ((roundedScore - 1) / 3) * 9;
    const weightedPoints = normalizedScore * entry.weight;

    totalWeightedScore += weightedPoints;
    totalWeight += entry.weight;

    // Deduplicate violations
    const seen = new Set<string>();
    const uniqueViolations = entry.violations.filter((v) => {
      const key = v.analysis?.toLowerCase().trim() || "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    aggregatedCriteria.push({
      name,
      score: roundedScore,
      weight: entry.weight,
      normalized_score: Number(normalizedScore.toFixed(2)),
      weighted_points: Number(weightedPoints.toFixed(2)),
      summary: entry.summaries.join(" "),
      reasoning: entry.reasonings.join(" "),
      violations: uniqueViolations,
    });
  }

  const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

  return {
    type: EvaluationType.SUBJECTIVE,
    final_score: Number(finalScore.toFixed(1)),
    criteria: aggregatedCriteria,
  };
}
