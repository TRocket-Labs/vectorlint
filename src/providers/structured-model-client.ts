import type { TokenUsage } from './token-usage';
import type { ReviewCallContext } from './request-builder';

/**
 * Result of a structured model call: validated output plus optional usage.
 */
export interface LLMResult<T> {
  data: T;
  usage?: TokenUsage;
}

/** Makes one structured model call and returns validated output. */
export interface StructuredModelClient {
  runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> },
    context?: ReviewCallContext,
  ): Promise<LLMResult<T>>;
}
