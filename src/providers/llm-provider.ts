import type { TokenUsage } from './token-usage';
import type { EvalContext } from './request-builder';
import type { LanguageModel } from 'ai';

export interface LLMResult<T> {
  data: T;
  usage?: TokenUsage;
}

export interface LLMProvider {
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: { name: string; schema: Record<string, unknown> }, context?: EvalContext): Promise<LLMResult<T>>;
  getLanguageModel(): LanguageModel;
}
