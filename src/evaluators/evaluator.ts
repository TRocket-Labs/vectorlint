import type { EvaluationResult } from '../prompts/schema';

/*
 * Core evaluator interface for content evaluation.
 * Implementations receive a file path and content, returning structured evaluation results.
 */
export interface Evaluator {
  evaluate(file: string, content: string): Promise<EvaluationResult>;
}
