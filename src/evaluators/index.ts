/*
 * Evaluators module - exports evaluator interface, base class, and registry.
 * 
 * Import this module to:
 * - Access the Evaluator interface for type definitions
 * - Use BaseEvaluator as a base class for custom evaluators
 * - Use registry functions to create and register evaluators
 * 
 * Importing this module also triggers self-registration of all built-in evaluators.
 */

// Core interface
export type { Evaluator } from './evaluator';

// Base evaluator class (also triggers 'base' registration on import)
export { BaseEvaluator } from './base-evaluator';

// Registry functions
export {
  registerEvaluator,
  createEvaluator,
  getRegisteredEvaluatorTypes,
  type EvaluatorFactory,
} from './evaluator-registry';

// Prompt loader for evaluator-specific prompts
export { getPrompt } from './prompt-loader';

// Import specialized evaluators to trigger their self-registration
// These must be imported after base-evaluator to ensure registry is ready
import './accuracy-evaluator';
