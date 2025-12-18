import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import type { TokenUsage } from '../providers/token-usage';
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
import { Type, Severity, EvaluationType } from './types';

/*
 * Core LLM-based evaluator that handles Subjective and Semi-Objective evaluation modes.
 * Mode is determined by prompt frontmatter 'type' field:
 * - 'subjective': Weighted average of 1-4 scores per criterion, normalized to 1-10.
 * - 'semi-objective': Density-based scoring (errors per 100 words).
 *
 * Subclasses can override protected methods to customize evaluation behavior
 * while reusing the core evaluation logic.
 */
export class BaseEvaluator implements Evaluator {
  protected lastUsage?: TokenUsage;

  constructor(
    protected llmProvider: LLMProvider,
    protected prompt: PromptFile,
    protected defaultSeverity?: Severity
  ) { }

  async evaluate(_file: string, content: string): Promise<EvaluationResult> {
    const type = this.getEvaluationType();

    if (type === EvaluationType.SUBJECTIVE) {
      return this.runSubjectiveEvaluation(content);
    } else {
      return this.runSemiObjectiveEvaluation(content);
    }
  }

  getLastUsage(): TokenUsage | undefined {
    return this.lastUsage;
  }

  /*
   * Determines the evaluation type.
   * Defaults to 'semi-objective' if not specified, for backward compatibility.
   */
  protected getEvaluationType(): typeof EvaluationType.SUBJECTIVE | typeof EvaluationType.SEMI_OBJECTIVE {
    return this.prompt.meta.type === 'subjective' ? EvaluationType.SUBJECTIVE : EvaluationType.SEMI_OBJECTIVE;
  }

  /*
   * Runs subjective evaluation:
   * 1. LLM scores each criterion 1-4.
   * 2. We normalize to 1-10 scale using linear interpolation.
   * 3. Calculate weighted average.
   */
  protected async runSubjectiveEvaluation(content: string): Promise<SubjectiveResult> {
    const schema = buildSubjectiveLLMSchema();

    // Step 1: Get raw scores from LLM
    const { data: llmResult, usage } = await this.llmProvider.runPromptStructured<SubjectiveLLMResult>(
      content,
      this.prompt.body,
      schema
    );
    if (usage) {
      this.lastUsage = usage;
    }

    // Step 2: Calculate scores locally
    let totalWeightedScore = 0;
    let totalWeight = 0;

    const criteriaWithCalculations = llmResult.criteria.map((c) => {
      // Find the weight from the prompt definition
      const definedCriterion = this.prompt.meta.criteria?.find((dc) => dc.name === c.name);
      const weight = definedCriterion?.weight || 1; // Default to weight 1 if missing

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
      final_score: Number(finalScore.toFixed(1)), // Round to 1 decimal
      criteria: criteriaWithCalculations,
    };
  }

  /*
   * Runs semi-objective evaluation:
   * 1. LLM lists violations only.
   * 2. We calculate score based on violation density (per 100 words).
   */
  protected async runSemiObjectiveEvaluation(content: string): Promise<SemiObjectiveResult> {
    const schema = buildSemiObjectiveLLMSchema();

    // Step 1: Get list of violations from LLM
    const { data: llmResult, usage } = await this.llmProvider.runPromptStructured<SemiObjectiveLLMResult>(
      content,
      this.prompt.body,
      schema
    );
    if (usage) {
      this.lastUsage = usage;
    }

    // Step 2: Calculate scores based on violation density
    // Estimate word count (simple whitespace split)
    const wordCount = content.trim().split(/\s+/).length || 1;

    return this.calculateSemiObjectiveResult(llmResult.violations, wordCount);
  }

  /*
   * Centralized scoring logic for semi-objective evaluations.
   * Calculates score based on violation density.
   */
  protected calculateSemiObjectiveResult(items: SemiObjectiveItem[], wordCount: number): SemiObjectiveResult {
    // items is already violations (LLM only returns failures)
    const violations = items.map(item => ({
      analysis: item.analysis,
      ...(item.suggestion && { suggestion: item.suggestion }),
      ...(item.pre && { pre: item.pre }),
      ...(item.post && { post: item.post }),
      criterionName: item.description,
    }));

    // Density Calculation
    // Density = Violations per 100 words
    const density = (violations.length / wordCount) * 100;

    // Strictness Factor (Default 10)
    let strictness = 10;
    const strictnessConfig = this.prompt.meta.strictness;

    if (typeof strictnessConfig === 'number') {
      strictness = strictnessConfig;
    } else if (strictnessConfig === 'lenient') {
      strictness = 5;
    } else if (strictnessConfig === 'strict') {
      strictness = 20;
    } else if (strictnessConfig === 'standard') {
      strictness = 10;
    }

    // Score Calculation
    // Score = 100 - (Density * Strictness)
    // Clamped between 0 and 100
    const rawScore = Math.max(0, Math.min(100, 100 - (density * strictness)));

    // Final Score on 1-10 scale
    const finalScore = rawScore / 10;

    // Determine status
    let status: typeof Severity.WARNING | typeof Severity.ERROR | undefined;

    if (finalScore < 10) {
      // Priority: Prompt Meta > Config Default > Warning (Fallback)
      if (this.prompt.meta.severity) {
        status = this.prompt.meta.severity === Severity.ERROR ? Severity.ERROR : Severity.WARNING;
      } else if (this.defaultSeverity) {
        status = this.defaultSeverity;
      } else {
        status = Severity.WARNING;
      }
    }

    const message = violations.length > 0
      ? `Found ${violations.length} issue${violations.length > 1 ? 's' : ''}`
      : 'No issues found';

    const result: SemiObjectiveResult = {
      type: EvaluationType.SEMI_OBJECTIVE,
      final_score: Number(finalScore.toFixed(1)),
      percentage: Number(rawScore.toFixed(1)),
      passed_count: 0,  // No longer meaningful
      total_count: violations.length,
      items: items,
      message,
      violations,
      // Severity is mandatory in SemiObjectiveResult
      // Default to WARNING if not specified (e.g. perfect score)
      severity: status || Severity.WARNING,
    };

    return result;
  }
}

// Register as default evaluator for base type
// Note: EvaluatorFactory signature is (llmProvider, prompt, searchProvider?, defaultSeverity?)
registerEvaluator(Type.BASE, (llmProvider, prompt, _searchProvider, defaultSeverity) => {
  return new BaseEvaluator(llmProvider, prompt, defaultSeverity);
});
