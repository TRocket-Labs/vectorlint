import type { Evaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { SearchProvider } from '../providers/search-provider';
import type { PromptFile } from '../schemas/prompt-schemas';

/*
 * Factory function signature for creating evaluators.
 * Evaluators can optionally depend on search providers for fact verification.
 */
export type EvaluatorFactory = (
  llmProvider: LLMProvider,
  prompt: PromptFile,
  searchProvider?: SearchProvider
) => Evaluator;

/*
 * EvaluatorRegistry manages evaluator type registration and instantiation.
 * Evaluators self-register by calling registerEvaluator() in their module.
 */
class EvaluatorRegistry {
  private registry = new Map<string, EvaluatorFactory>();

  register(type: string, factory: EvaluatorFactory): void {
    if (this.registry.has(type)) {
      throw new Error(`Evaluator type '${type}' is already registered`);
    }
    this.registry.set(type, factory);
  }

  create(
    type: string,
    llmProvider: LLMProvider,
    prompt: PromptFile,
    searchProvider?: SearchProvider
  ): Evaluator {
    const factory = this.registry.get(type);
    
    if (!factory) {
      const available = Array.from(this.registry.keys()).join(', ');
      throw new Error(
        `Unknown evaluator type: '${type}'. Available types: ${available || 'none'}`
      );
    }

    return factory(llmProvider, prompt, searchProvider);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}

// Singleton instance
const REGISTRY = new EvaluatorRegistry();

// Public API
export function registerEvaluator(type: string, factory: EvaluatorFactory): void {
  REGISTRY.register(type, factory);
}

export function createEvaluator(
  type: string,
  llmProvider: LLMProvider,
  prompt: PromptFile,
  searchProvider?: SearchProvider
): Evaluator {
  return REGISTRY.create(type, llmProvider, prompt, searchProvider);
}

export function getRegisteredEvaluatorTypes(): string[] {
  return REGISTRY.getRegisteredTypes();
}
