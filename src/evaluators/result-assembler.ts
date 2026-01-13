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
 *
 * @example
 * ```ts
 * const assembler = new ResultAssembler();
 * const checkResult = assembler.assembleCheckResult(
 *   detectionResult,
 *   suggestionResult,
 *   { severity: Severity.ERROR, totalWordCount: 500 }
 * );
 * ```
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
    const strictness = this.normalizeStrictness(rawStrictness);

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
    const score = this.calculateCheckScore(
      violationCount,
      totalWordCount,
      strictness
    );

    // Build message based on violation count
    const message = this.buildCheckMessage(violationCount, severity);

    return {
      type: EvaluationType.CHECK,
      final_score: score,
      percentage: score * 10, // 1-10 scale to 1-100 percentage
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

        // Calculate a normalized score based on violation count
        // More violations = lower score (1-4 scale)
        const score = this.calculateCriterionScore(violations.length);

        return {
          name: criterionName,
          weight,
          score,
          normalized_score: score * 2.5, // 1-4 to 1-10 scale
          weighted_points: score * 2.5 * weight,
          summary: this.buildCriterionSummary(criterionName, violations.length),
          reasoning: this.buildCriterionReasoning(criterionName, violations),
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
    // Create a map of issueIndex to suggestion for efficient lookup
    const suggestionMap = new Map<number, Suggestion>();
    for (const suggestion of suggestions) {
      suggestionMap.set(suggestion.issueIndex, suggestion);
    }

    // Merge issues with their corresponding suggestions
    return issues.map((issue, index) => {
      const matchingSuggestion = suggestionMap.get(index + 1); // 1-based index
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
   * Calculate a check-style score based on violation count.
   *
   * @param violationCount - Number of violations found
   * @param totalWordCount - Total word count of content
   * @param strictness - Strictness multiplier (default: 1)
   * @returns Score on 1-10 scale (higher is better)
   */
  private calculateCheckScore(
    violationCount: number,
    totalWordCount: number,
    strictness: number
  ): number {
    if (violationCount === 0) return 10;

    // Calculate violations per 100 words
    const violationsPer100Words =
      (violationCount / totalWordCount) * 100 * strictness;

    // Convert to 1-10 scale (more violations = lower score)
    // 0 violations = 10, 1+ violations per 100 words = descending scale
    const score = Math.max(1, 10 - violationsPer100Words * 2);
    return Math.round(score * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate a criterion score on the 1-4 judge scale.
   *
   * @param violationCount - Number of violations for this criterion
   * @returns Score on 1-4 scale (lower is better for violations)
   */
  private calculateCriterionScore(violationCount: number): 1 | 2 | 3 | 4 {
    if (violationCount === 0) return 4;
    if (violationCount === 1) return 3;
    if (violationCount <= 3) return 2;
    return 1;
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

    return Math.round(score * 10) / 10; // Round to 1 decimal
  }

  /**
   * Build a check result message based on violation count.
   *
   * @param violationCount - Number of violations
   * @param severity - Severity level
   * @returns Human-readable message
   */
  private buildCheckMessage(
    violationCount: number,
    severity: Severity
  ): string {
    if (violationCount === 0) {
      return "No issues found.";
    }

    const severityText =
      severity === Severity.ERROR ? "error" : "warning";
    const plural = violationCount === 1 ? "" : "s";
    return `Found ${violationCount} ${severityText}${plural}.`;
  }

  /**
   * Build a criterion summary for judge results.
   *
   * @param criterionName - Name of the criterion
   * @param violationCount - Number of violations
   * @returns Summary string
   */
  private buildCriterionSummary(
    criterionName: string,
    violationCount: number
  ): string {
    if (violationCount === 0) {
      return `Pass: ${criterionName}`;
    }
    return `Issue${violationCount > 1 ? "s" : ""} found with ${criterionName}`;
  }

  /**
   * Build criterion reasoning for judge results.
   *
   * @param criterionName - Name of the criterion
   * @param violations - Array of violations for this criterion
   * @returns Reasoning string
   */
  private buildCriterionReasoning(
    criterionName: string,
    violations: Array<{
      quotedText: string;
      analysis: string;
    }>
  ): string {
    if (violations.length === 0) {
      return `Content meets the ${criterionName} criterion.`;
    }

    const parts = [
      `${violations.length} violation${violations.length > 1 ? "s" : ""} of ${criterionName} found.`,
    ];

    for (const v of violations) {
      parts.push(`- "${v.quotedText}": ${v.analysis}`);
    }

    return parts.join("\n");
  }

  /**
   * Normalize strictness from string or number to number.
   *
   * @param strictness - Strictness value as number or string enum
   * @returns Normalized strictness as number (default: 1)
   */
  private normalizeStrictness(
    strictness: number | "lenient" | "standard" | "strict" | undefined
  ): number {
    if (typeof strictness === "number") {
      return strictness;
    }
    switch (strictness) {
      case "lenient":
        return 0.5;
      case "standard":
        return 1;
      case "strict":
        return 2;
      default:
        return 1;
    }
  }
}
