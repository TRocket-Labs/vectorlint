import type { Evaluator } from './evaluator';
import type { LLMProvider } from '../providers/llm-provider';
import type { PromptFile } from '../schemas/prompt-schemas';
import { buildCriteriaJsonSchema, type CriteriaResult } from '../prompts/schema';

/**
 * BaseLLMEvaluator wraps the existing single-prompt evaluation logic.
 * This is the current VectorLint evaluation system refactored into the evaluator pattern.
 * 
 * It runs a prompt directly against content using the LLM provider and returns
 * structured criteria results.
 */
export class BaseLLMEvaluator implements Evaluator {
  private llmProvider: LLMProvider;
  private prompt: PromptFile;

  constructor(llmProvider: LLMProvider, prompt: PromptFile) {
    this.llmProvider = llmProvider;
    this.prompt = prompt;
  }

  /**
   * Evaluate content using the configured prompt
   * @param file - Relative file path (not used in base evaluation, but required by interface)
   * @param content - File content to evaluate
   * @returns Criteria results in standard format
   */
  async evaluate(file: string, content: string): Promise<CriteriaResult> {
    // Build criteria JSON schema (existing function)
    const schema = buildCriteriaJsonSchema();

    // Call LLM provider with content and prompt body (existing logic)
    const result = await this.llmProvider.runPromptStructured<CriteriaResult>(
      content,
      this.prompt.body,
      schema
    );

    // Return result (already in correct CriteriaResult format)
    return result;
  }
}
