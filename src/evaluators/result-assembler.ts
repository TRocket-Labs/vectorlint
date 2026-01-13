/**
 * ResultAssembler - Combines detection and suggestion phase results.
 *
 * This class is responsible for merging the output from both phases of the
 * two-phase detection/suggestion architecture:
 * 1. Detection phase: Identifies issues in content (RawDetectionIssue[])
 * 2. Suggestion phase: Generates suggestions for each issue (Suggestion[])
 *
 * The ResultAssembler produces the final CheckResult or JudgeResult format
 * that the rest of the system expects, while aggregating token usage from
 * both phases.
 */

import type { TokenUsage } from "../providers/token-usage";
import { EvaluationType, Severity } from "./types";
import type { CheckResult, JudgeResult } from "../prompts/schema";
import type { RawDetectionIssue } from "./detection-phase";
import type { Suggestion } from "./suggestion-phase";
import type { PromptCriterionSpec } from "../schemas/prompt-schemas";

/**
 * Options for configuring result assembly.
 */
export interface ResultAssemblerOptions {
  /** Severity level for check results (default: WARNING) */
  severity?: Severity;
  /** Total word count of the evaluated content (for score calculation) */
  totalWordCount?: number;
  /** Strictness level for check results (affects score calculation) - can be number or string enum */
  strictness?: number | "lenient" | "standard" | "strict";
  /** Prompt criteria metadata (for judge results) - accepts full PromptCriterionSpec */
  promptCriteria?: PromptCriterionSpec[];
}

/**
 * ResultAssembler combines detection and suggestion results into final output formats.
 *
 * This class handles:
 * 1. Merging detection issues with their corresponding suggestions
 * 2. Aggregating token usage from both phases
 * 3. Producing CheckResult or JudgeResult compatible output
 */
export class ResultAssembler {
  /**
   * Assemble a CheckResult from detection and suggestion phase results.
   *
   * @param detectionIssues - Issues detected in the detection phase
   * @param suggestions - Suggestions generated in the suggestion phase
   * @param options - Configuration options for result assembly
   * @returns A CheckResult compatible with the existing evaluator output
   */
  assembleCheckResult(
    detectionIssues: RawDetectionIssue[],
    suggestions: Suggestion[],
    options: ResultAssemblerOptions = {}
  ): CheckResult {
    const {
      severity = Severity.WARNING,
      totalWordCount = 1,
      strictness: rawStrictness = 1,
    } = options;

    // Convert strictness from string or number to number
    const strictness =
      typeof rawStrictness === "number"
        ? rawStrictness
        : rawStrictness === "lenient"
          ? 0.5
          : rawStrictness === "strict"
            ? 2
            : 1;

    // Merge detection issues with suggestions by issue index
    const mergedItems = this.mergeIssuesWithSuggestions(
      detectionIssues,
      suggestions
    );

    // Build violations array (similar to CheckLLMResult format)
    const violations = mergedItems.map((item) => {
      const violation: {
        quoted_text: string;
        context_before: string;
        context_after: string;
        analysis: string;
        criterionName: string;
        suggestion?: string;
      } = {
        quoted_text: item.quotedText,
        context_before: item.contextBefore,
        context_after: item.contextAfter,
        analysis: item.analysis,
        criterionName: item.criterionName,
      };
      if (item.suggestion !== undefined) {
        violation.suggestion = item.suggestion;
      }
      return violation;
    });

    // Calculate violation-based score (errors per 100 words)
    const violationCount = mergedItems.length;
    const score =
      violationCount === 0
        ? 10
        : Math.max(
            1,
            10 -
              ((violationCount / totalWordCount) * 100 * strictness) * 2
          );
    const roundedScore = Math.round(score * 10) / 10;

    // Build message based on violation count
    const message =
      violationCount === 0
        ? "No issues found."
        : `Found ${violationCount} ${severity === Severity.ERROR ? "error" : "warning"}${violationCount === 1 ? "" : "s"}.`;

    return {
      type: EvaluationType.CHECK,
      final_score: roundedScore,
      percentage: roundedScore * 10, // 1-10 scale to 1-100 percentage
      violation_count: violationCount,
      items: mergedItems.map((item) => {
        const checkItem: {
          description: string;
          analysis: string;
          quoted_text: string;
          context_before: string;
          context_after: string;
          suggestion?: string;
        } = {
          description: item.criterionName,
          analysis: item.analysis,
          quoted_text: item.quotedText,
          context_before: item.contextBefore,
          context_after: item.contextAfter,
        };
        if (item.suggestion !== undefined) {
          checkItem.suggestion = item.suggestion;
        }
        return checkItem;
      }),
      severity,
      message,
      violations,
    };
  }

  /**
   * Assemble a JudgeResult from detection and suggestion phase results.
   *
   * @param detectionIssues - Issues detected in the detection phase
   * @param suggestions - Suggestions generated in the suggestion phase
   * @param options - Configuration options for result assembly
   * @returns A JudgeResult compatible with the existing evaluator output
   */
  assembleJudgeResult(
    detectionIssues: RawDetectionIssue[],
    suggestions: Suggestion[],
    options: ResultAssemblerOptions = {}
  ): JudgeResult {
    const { promptCriteria = [] } = options;

    // Merge detection issues with suggestions by issue index
    const mergedItems = this.mergeIssuesWithSuggestions(
      detectionIssues,
      suggestions
    );

    // Group issues by criterion name for judge format
    const criteriaMap = new Map<
      string,
      Array<{
        quotedText: string;
        contextBefore: string;
        contextAfter: string;
        line: number;
        analysis: string;
        suggestion: string;
      }>
    >();

    for (const item of mergedItems) {
      if (!criteriaMap.has(item.criterionName)) {
        criteriaMap.set(item.criterionName, []);
      }
      criteriaMap.get(item.criterionName)!.push({
        quotedText: item.quotedText,
        contextBefore: item.contextBefore,
        contextAfter: item.contextAfter,
        line: item.line,
        analysis: item.analysis,
        suggestion: item.suggestion || "No specific suggestion provided.",
      });
    }

    // Build criteria array (similar to JudgeLLMResult format)
    const criteria = Array.from(criteriaMap.entries()).map(
      ([criterionName, violations]) => {
        // Get weight from prompt criteria or default to 1
        const weight =
          promptCriteria.find((c) => c.name === criterionName)?.weight ?? 1;

        // Calculate a normalized score based on violation count (1-4 scale)
        const score: 1 | 2 | 3 | 4 =
          violations.length === 0
            ? 4
            : violations.length === 1
              ? 3
              : violations.length <= 3
                ? 2
                : 1;

        // Build summary
        const summary =
          violations.length === 0
            ? `Pass: ${criterionName}`
            : `Issue${violations.length > 1 ? "s" : ""} found with ${criterionName}`;

        // Build reasoning
        let reasoning: string;
        if (violations.length === 0) {
          reasoning = `Content meets the ${criterionName} criterion.`;
        } else {
          const parts: string[] = [
            `${violations.length} violation${violations.length > 1 ? "s" : ""} of ${criterionName} found.`,
          ];
          for (const v of violations) {
            parts.push(`- "${v.quotedText}": ${v.analysis}`);
          }
          reasoning = parts.join("\n");
        }

        return {
          name: criterionName,
          weight,
          score,
          normalized_score: score * 2.5, // 1-4 to 1-10 scale
          weighted_points: score * 2.5 * weight,
          summary,
          reasoning,
          violations: violations.map((v) => ({
            quoted_text: v.quotedText,
            context_before: v.contextBefore,
            context_after: v.contextAfter,
            analysis: v.analysis,
            suggestion: v.suggestion,
          })),
        };
      }
    );

    // Calculate final weighted score
    const finalScore = this.calculateFinalScore(criteria);

    return {
      type: EvaluationType.JUDGE,
      final_score: finalScore,
      criteria,
    };
  }

  /**
   * Aggregate token usage from detection and suggestion phases.
   *
   * @param detectionUsage - Token usage from detection phase
   * @param suggestionUsage - Token usage from suggestion phase
   * @returns Combined token usage, or undefined if both are undefined
   */
  aggregateTokenUsage(
    detectionUsage?: TokenUsage,
    suggestionUsage?: TokenUsage
  ): TokenUsage | undefined {
    const usages: TokenUsage[] = [];
    if (detectionUsage) usages.push(detectionUsage);
    if (suggestionUsage) usages.push(suggestionUsage);

    if (usages.length === 0) return undefined;

    return usages.reduce(
      (acc, usage) => ({
        inputTokens: acc.inputTokens + usage.inputTokens,
        outputTokens: acc.outputTokens + usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 }
    );
  }

  /**
   * Merge detection issues with their corresponding suggestions.
   *
   * @param issues - Raw detection issues from detection phase
   * @param suggestions - Suggestions from suggestion phase
   * @returns Array of merged items with suggestions matched by index
   */
  private mergeIssuesWithSuggestions(
    issues: RawDetectionIssue[],
    suggestions: Suggestion[]
  ): Array<
    RawDetectionIssue & {
      suggestion?: string;
    }
  > {
    const suggestionMap = new Map<number, Suggestion>();
    for (const suggestion of suggestions) {
      suggestionMap.set(suggestion.issueIndex, suggestion);
    }

    return issues.map((issue, index) => {
      const matchingSuggestion = suggestionMap.get(index + 1);
      const merged: RawDetectionIssue & { suggestion?: string } = {
        quotedText: issue.quotedText,
        contextBefore: issue.contextBefore,
        contextAfter: issue.contextAfter,
        line: issue.line,
        criterionName: issue.criterionName,
        analysis: issue.analysis,
      };
      if (matchingSuggestion?.suggestion !== undefined) {
        merged.suggestion = matchingSuggestion.suggestion;
      }
      return merged;
    });
  }

  /**
   * Calculate the final weighted score from criterion scores.
   *
   * @param criteria - Array of criteria with scores and weights
   * @returns Final weighted score on 1-10 scale
   */
  private calculateFinalScore(
    criteria: Array<{
      weight: number;
      weighted_points: number;
    }>
  ): number {
    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 10;

    const totalPoints = criteria.reduce((sum, c) => sum + c.weighted_points, 0);
    const score = totalPoints / totalWeight;

    return Math.round(score * 10) / 10;
  }
}
