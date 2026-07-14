import type { ZodType } from 'zod';
import type { LLMResult } from './structured-model-client';

/**
 * An executor-owned tool definition supplied to the bounded tool-calling
 * transport. The provider is transport only: it does not define or name
 * product tools. Descriptions and parameter schemas come from the caller (the
 * agent executor), keyed by the caller-supplied tool name, never from the
 * provider (audit Finding #2). The object key in the tools map is the tool
 * name, matching the existing provider tool-mapping convention.
 */
export interface ToolCallDefinition {
  description: string;
  parameters: ZodType;
  execute: (input: unknown) => Promise<unknown>;
}

/**
 * Bounded execution metadata for a single tool-calling run. The caller
 * (executor) sets the bounds from the review budget (audit Finding #7); the
 * transport honors them. It does not invent its own product-level loop.
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
 * Permanent bounded tool-calling model capability (audit Finding #2).
 *
 * A {@link ToolCallingModelClient} performs a single bounded generation that
 * may execute caller-supplied tools and then emits structured output. The tool
 * map is executor-owned and transport-shaped: this interface deliberately
 * names no product, workspace, or agent-finding concept (audit Product
 * Decision; Finding #1). The autonomous product loop is removed; bounded
 * orchestration lives in the executor, which supplies the only tool(s) it
 * permits (for example a target-scoped reader).
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
