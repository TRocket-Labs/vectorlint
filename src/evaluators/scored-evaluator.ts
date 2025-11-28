import { BaseEvaluator } from "./evaluator";
import type { LLMProvider } from "../providers/llm-provider";
import type { PromptFile } from "../schemas/prompt-schemas";
import {
  buildCriteriaJsonSchema,
  type CriteriaResult,
} from "../prompts/schema";

/*
 * Scored evaluator using structured output.
 * Wraps existing single-prompt evaluation logic in the evaluator pattern.
 */
export class ScoredEvaluator extends BaseEvaluator {
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
ScoredEvaluator.register("scored", (llmProvider, prompt) => {
  return new ScoredEvaluator(llmProvider, prompt);
});
