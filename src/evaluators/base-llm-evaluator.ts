import { BaseEvaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { buildCriteriaJsonSchema, type CriteriaResult } from '../prompts/schema';

/*
 * Base LLM evaluator using structured output.
 * Wraps existing single-prompt evaluation logic in the evaluator pattern.
 */
export class BaseLLMEvaluator extends BaseEvaluator {
  private llmProvider: LLMProvider;
  private prompt: PromptFile;

  constructor(llmProvider: LLMProvider, prompt: PromptFile) {
    super();
    this.llmProvider = llmProvider;
    this.prompt = prompt;
  }

  async evaluate(_file: string, content: string): Promise<CriteriaResult> {
    const schema = buildCriteriaJsonSchema();
    const result = await this.llmProvider.runPromptStructured<CriteriaResult>(
      content,
      this.prompt.body,
      schema
    );
    return result;
  }
}

// Self-register on module load
BaseLLMEvaluator.register('base-llm', (llmProvider, prompt) => {
  return new BaseLLMEvaluator(llmProvider, prompt);
});
