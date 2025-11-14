import type { Evaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { buildCriteriaJsonSchema, type CriteriaResult } from '../prompts/schema';

// Wraps existing single-prompt evaluation logic in the evaluator pattern
export class BaseLLMEvaluator implements Evaluator {
  private llmProvider: LLMProvider;
  private prompt: PromptFile;

  constructor(llmProvider: LLMProvider, prompt: PromptFile) {
    this.llmProvider = llmProvider;
    this.prompt = prompt;
  }

  async evaluate(file: string, content: string): Promise<CriteriaResult> {
    const schema = buildCriteriaJsonSchema();
    const result = await this.llmProvider.runPromptStructured<CriteriaResult>(
      content,
      this.prompt.body,
      schema
    );
    return result;
  }
}
