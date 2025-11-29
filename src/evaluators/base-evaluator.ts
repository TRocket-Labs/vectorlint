import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import {
  buildSubjectiveLLMSchema,
  buildSemiObjectiveLLMSchema,
  type SubjectiveLLMResult,
  type SemiObjectiveLLMResult,
  type SubjectiveResult,
  type SemiObjectiveResult,
  type EvaluationResult,
  type SemiObjectiveItem,
} from '../prompts/schema';
import { registerEvaluator } from './evaluator-registry';
import type { Evaluator } from './evaluator';
import { Type } from './types';

/*
 * Core LLM-based evaluator that handles Subjective and Semi-Objective evaluation modes.
 * Mode is determined by prompt frontmatter 'type' field:
 * - 'subjective': Weighted average of 0-4 scores per criterion.
 * - 'semi-objective': Percentage of passed items.
 *
 * Subclasses can override protected methods to customize evaluation behavior
 * while reusing the core evaluation logic.
 */
export class BaseEvaluator implements Evaluator {
  constructor(
    protected llmProvider: LLMProvider,
    protected prompt: PromptFile
  ) { }

  async evaluate(_file: string, content: string): Promise<EvaluationResult> {
    const type = this.getEvaluationType();

    if (type === 'subjective') {
      return this.runSubjectiveEvaluation(content);
    } else {
      return this.runSemiObjectiveEvaluation(content);
    }
  }

  /*
   * Determines the evaluation type.
   * Defaults to 'semi-objective' if not specified, for backward compatibility.
   */
  protected getEvaluationType(): 'subjective' | 'semi-objective' {
    return this.prompt.meta.type || 'semi-objective';
  }

  /*
   * Runs subjective evaluation:
   * 1. LLM scores each criterion 0-4.
   * 2. We calculate weighted average and map to 1-10 scale.
   */
  protected async runSubjectiveEvaluation(content: string): Promise<SubjectiveResult> {
    const schema = buildSubjectiveLLMSchema();

    // Step 1: Get raw scores from LLM
    const llmResult = await this.llmProvider.runPromptStructured<SubjectiveLLMResult>(
      content,
      this.prompt.body,
      schema
    );

    // Step 2: Calculate scores locally
    let totalWeightedScore = 0;
    let totalWeight = 0;

    const criteriaWithCalculations = llmResult.criteria.map((c) => {
      // Find the weight from the prompt definition
      const definedCriterion = this.prompt.meta.criteria?.find((dc) => dc.name === c.name);
      const weight = definedCriterion?.weight || 1; // Default to weight 1 if missing

      // Calculate weighted points for this criterion
      // Score is 0-4. Percentage is (score/4)*100.
      // Weighted points = percentage * weight
      const percentage = (c.score / 4) * 100;
      const weightedPoints = percentage * weight;

      totalWeightedScore += weightedPoints;
      totalWeight += weight;

      return {
        ...c,
        weight,
        weighted_points: weightedPoints,
      };
    });

    // Calculate final weighted average percentage
    const finalPercentage = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    // Map percentage to 1-10 scale
    const finalScore = finalPercentage / 10;

    return {
      type: 'subjective',
      final_score: Number(finalScore.toFixed(1)), // Round to 1 decimal
      criteria: criteriaWithCalculations,
    };
  }

  /*
   * Runs semi-objective evaluation:
   * 1. LLM lists violations only.
   * 2. We count violations and calculate score.
   */
  protected async runSemiObjectiveEvaluation(content: string): Promise<SemiObjectiveResult> {
    const schema = buildSemiObjectiveLLMSchema();

    // Step 1: Get list of violations from LLM
    const llmResult = await this.llmProvider.runPromptStructured<SemiObjectiveLLMResult>(
      content,
      this.prompt.body,
      schema
    );

    // Step 2: Calculate scores locally
    return this.calculateSemiObjectiveResult(llmResult.violations);
  }

  /*
   * Centralized scoring logic for semi-objective evaluations.
   * Calculates score based on violation count and determines status.
   */
  protected calculateSemiObjectiveResult(items: SemiObjectiveItem[]): SemiObjectiveResult {
    // items is already violations (LLM only returns failures)
    const violations = items.map(item => ({
      analysis: item.analysis,
      ...(item.suggestion && { suggestion: item.suggestion }),
      ...(item.pre && { pre: item.pre }),
      ...(item.post && { post: item.post }),
      criterionName: item.description,
    }));

    // Score calculation based on violation count
    const violationCount = violations.length;
    const finalScore = violationCount === 0 ? 10 : Math.max(1, 10 - violationCount);
    const percentage = (finalScore / 10) * 100;

    // Determine status: undefined if no violations (no output)
    const status: 'warning' | 'error' | undefined = violations.length > 0 ? 'warning' : undefined;
    const message = violations.length > 0
      ? `Found ${violations.length} issue${violations.length > 1 ? 's' : ''}`
      : 'No issues found';

    return {
      type: 'semi-objective',
      final_score: Number(finalScore.toFixed(1)),
      percentage: Number(percentage.toFixed(1)),
      passed_count: 0,  // No longer meaningful
      total_count: violationCount,
      items: items,
      status,
      message,
      violations,
    };
  }
}

// Register as default evaluator for base type
registerEvaluator(Type.BASE, (llmProvider, prompt) => new BaseEvaluator(llmProvider, prompt));
