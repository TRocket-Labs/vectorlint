/**
 * Evaluator Registry
 * 
 * Central registry for all evaluator types with factory functions.
 * Evaluators can have different dependencies (LLM providers, runners, etc.)
 */

import { LLMProvider } from '../providers/llm-provider.js';
import { ValeRunner } from './vale-ai/vale-runner.js';
import { ValeAIEvaluator } from './vale-ai/vale-ai-evaluator.js';
import { ValeAIConfig } from './vale-ai/types.js';

/**
 * Base evaluator interface
 */
export interface Evaluator {
  evaluate(files?: string[]): Promise<unknown>;
}

/**
 * Factory function type for creating evaluators
 * Different evaluators may require different dependencies
 */
export type EvaluatorFactory = (
  llmProvider: LLMProvider,
  config?: ValeAIConfig,
  valeRunner?: ValeRunner
) => Evaluator;

/**
 * Registry of evaluator factories
 * Maps evaluator name to its factory function
 */
export const EVALUATOR_REGISTRY = new Map<string, EvaluatorFactory>([
  ['vale-ai', (llmProvider: LLMProvider, config?: ValeAIConfig, valeRunner?: ValeRunner) => {
    if (!valeRunner) {
      throw new Error('Vale AI evaluator requires ValeRunner dependency');
    }
    
    // Use provided config or default
    const valeConfig: ValeAIConfig = config ?? {
      contextWindowSize: 100
    };
    
    return new ValeAIEvaluator(llmProvider, valeRunner, valeConfig);
  }],
]);

/**
 * Get an evaluator factory by name
 * @param name Evaluator name (e.g., 'vale-ai')
 * @returns Factory function or undefined if not found
 */
export function getEvaluatorFactory(name: string): EvaluatorFactory | undefined {
  return EVALUATOR_REGISTRY.get(name);
}

/**
 * Check if an evaluator is registered
 * @param name Evaluator name
 * @returns True if evaluator exists in registry
 */
export function hasEvaluator(name: string): boolean {
  return EVALUATOR_REGISTRY.has(name);
}

/**
 * Get list of all registered evaluator names
 * @returns Array of evaluator names
 */
export function getRegisteredEvaluators(): string[] {
  return Array.from(EVALUATOR_REGISTRY.keys());
}
