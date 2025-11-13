import type { CriteriaResult } from '../prompts/schema';

/**
 * Base interface for all evaluators.
 * Evaluators implement content evaluation logic and return standardized criteria results.
 */
export interface Evaluator {
  /**
   * Evaluate content and return criteria results
   * @param file - Relative file path
   * @param content - File content to evaluate
   * @returns Criteria results matching existing CriteriaResult schema
   */
  evaluate(file: string, content: string): Promise<CriteriaResult>;
}
