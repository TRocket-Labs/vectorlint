import type { CriteriaResult } from '../prompts/schema';
import { registerEvaluator, type EvaluatorFactory } from './evaluator-registry';

export interface Evaluator {
  evaluate(file: string, content: string): Promise<CriteriaResult>;
}

/*
 * Base class for evaluators with self-registration support.
 * Subclasses should call register() to make themselves available to the registry.
 */
export abstract class BaseEvaluator implements Evaluator {
  abstract evaluate(file: string, content: string): Promise<CriteriaResult>;

  /*
   * Register an evaluator type with the registry.
   * Should be called once per evaluator class, typically at module load.
   */
  public static register(type: string, factory: EvaluatorFactory): void {
    registerEvaluator(type, factory);
  }
}
