import type { TokenUsage } from './token-usage';
import type { EvalContext } from './request-builder';

/**
 * Result of a structured model call: validated output plus optional usage.
 */
export interface LLMResult<T> {
  data: T;
  usage?: TokenUsage;
}

/**
 * Permanent structured-output model capability (audit Finding #2).
 *
 * A {@link StructuredModelClient} makes a single structured model call and
 * returns validated output. It owns no tool surface and no autonomous agent
 * loop; that product-level autonomy is removed from the provider surface
 * (audit Product Decision). The single structured-call executor builds on this
 * capability.
 */
export interface StructuredModelClient {
  runPromptStructured<T = unknown>(
    content: string,
    promptText: string,
    schema: { name: string; schema: Record<string, unknown> },
    context?: EvalContext,
  ): Promise<LLMResult<T>>;
}
