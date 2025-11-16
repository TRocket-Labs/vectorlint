import type { Evaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { BaseLLMEvaluator } from './base-llm-evaluator';

// Placeholder for Phase 2 - will be implemented in src/providers/search-provider.ts
export interface SearchProvider {
  search(query: string): Promise<unknown>;
}

export type EvaluatorFactory = (
  llmProvider: LLMProvider,
  prompt: PromptFile,
  searchProvider?: SearchProvider
) => Evaluator;

const EVALUATOR_REGISTRY = new Map<string, EvaluatorFactory>();

export function registerEvaluator(type: string, factory: EvaluatorFactory): void {
  EVALUATOR_REGISTRY.set(type, factory);
}

export function createEvaluator(
  type: string,
  llmProvider: LLMProvider,
  prompt: PromptFile,
  searchProvider?: SearchProvider
): Evaluator {
  const factory = EVALUATOR_REGISTRY.get(type);
  
  if (!factory) {
    const available = Array.from(EVALUATOR_REGISTRY.keys()).join(', ');
    throw new Error(
      `Unknown evaluator type: '${type}'. Available types: ${available || 'none'}`
    );
  }

  // Phase 2 will add 'technical-accuracy' which requires searchProvider
  if (type === 'technical-accuracy' && !searchProvider) {
    throw new Error(
      `Evaluator type '${type}' requires a search provider, but none was provided`
    );
  }

  return factory(llmProvider, prompt, searchProvider);
}

registerEvaluator('base-llm', (llmProvider, prompt) => {
  return new BaseLLMEvaluator(llmProvider, prompt);
});
