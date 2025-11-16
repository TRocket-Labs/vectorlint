import type { CriteriaResult } from '../prompts/schema';

export interface Evaluator {
  evaluate(file: string, content: string): Promise<CriteriaResult>;
}
