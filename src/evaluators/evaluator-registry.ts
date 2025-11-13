import type { Evaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { BaseLLMEvaluator } from './base-llm-evaluator';

/**
 * Search provider interface (placeholder for Phase 2)
 * Will be implemented in src/providers/search-provider.ts
 */
export interface SearchProvider {
  search(query: string): Promise<unknown>;
}

/**
 * Factory function type for creating evaluators
 */
export type EvaluatorFactory = (
  llmProvider: LLMProvider,
  prompt: PromptFile,
  searchProvider?: SearchProvider
) => Evaluator;

/**
 * Registry mapping evaluator type strings to factory functions
 */
const EVALUATOR_REGISTRY = new Map<string, EvaluatorFactory>();

/**
 * Register an evaluator type with its factory function
 * @param type - Evaluator type identifier (e.g., 'base-llm', 'technical-accuracy')
 * @param factory - Factory function that creates evaluator instances
 */
export function registerEvaluator(type: string, factory: EvaluatorFactory): void {
  EVALUATOR_REGISTRY.set(type, factory);
}

/**
 * Create an evaluator instance based on type
 * @param type - Evaluator type from prompt metadata
 * @param llmProvider - LLM provider instance
 * @param prompt - Prompt file configuration
 * @param searchProvider - Optional search provider (required for some evaluator types)
 * @returns Evaluator instance
 * @throws Error if evaluator type is unknown or required dependencies are missing
 */
export function createEvaluator(
  type: string,
  llmProvider: LLMProvider,
  prompt: PromptFile,
  searchProvider?: SearchProvider
): Evaluator {
  // Look up factory for evaluator type
  const factory = EVALUATOR_REGISTRY.get(type);
  
  if (!factory) {
    const available = Array.from(EVALUATOR_REGISTRY.keys()).join(', ');
    throw new Error(
      `Unknown evaluator type: '${type}'. Available types: ${available || 'none'}`
    );
  }

  // Validate required dependencies
  // Note: For Phase 1, only 'base-llm' is registered and doesn't need searchProvider
  // Phase 2 will add 'technical-accuracy' which requires searchProvider
  if (type === 'technical-accuracy' && !searchProvider) {
    throw new Error(
      `Evaluator type '${type}' requires a search provider, but none was provided`
    );
  }

  // Call factory to create evaluator instance
  return factory(llmProvider, prompt, searchProvider);
}

// Register built-in evaluators
registerEvaluator('base-llm', (llmProvider, prompt) => {
  return new BaseLLMEvaluator(llmProvider, prompt);
});
