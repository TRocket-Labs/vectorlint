import type { TokenUsage } from './token-usage';

export interface LLMResult<T> {
  data: T;
  usage?: TokenUsage;
}

export interface LLMProvider {
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: { name: string; schema: Record<string, unknown> }): Promise<LLMResult<T>>;
}
