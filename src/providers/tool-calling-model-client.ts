import type { ZodType } from 'zod';
import type { LLMResult } from './structured-model-client';

/**
 * An executor-owned tool definition supplied to the bounded tool-calling
 * transport. The provider is transport only: it does not define or name
 * product tools. Descriptions and parameter schemas come from the caller (the
 * agent executor), keyed by the caller-supplied tool name, never from the
 * provider.
 */
export interface ToolCallDefinition {
  description: string;
  parameters: ZodType;
  execute: (input: unknown) => Promise<unknown>;
}

/**
 * Bounded execution metadata for a single tool-calling run. The executor sets
 * the bounds from the review budget and the transport honors them.
 */
export interface ToolCallRunOptions {
  /** Opt in to recording prompt and generated payloads in telemetry. */
  recordPayloadTelemetry?: boolean;
  /** Maximum number of model steps (tool-call rounds) before the run stops. */
  maxSteps?: number;
  /** Provider retry budget for transient failures. */
  maxRetries?: number;
  /** Maximum concurrent tool executions per model step. Defaults to 1. */
  maxParallelToolCalls?: number;
  /** Optional abort signal for cooperative cancellation. */
  signal?: AbortSignal;
}

/**
 * Performs one bounded generation with caller-supplied tools and structured
 * output. The executor owns the tool map and orchestration limits.
 */
export interface ToolCallingModelClient {
  runWithTools<T = unknown>(params: {
    systemPrompt: string;
    prompt: string;
    tools: Record<string, ToolCallDefinition>;
    schema: { name: string; schema: Record<string, unknown> };
    options?: ToolCallRunOptions;
  }): Promise<LLMResult<T>>;
}
