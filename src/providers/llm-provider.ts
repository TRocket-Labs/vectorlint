import type { TokenUsage } from './token-usage';
import type { StructuredModelClient } from './structured-model-client';

/**
 * `LLMResult` now lives on the permanent structured-output capability. It is
 * re-exported here so existing deep imports (`from './llm-provider'`) keep
 * compiling until the legacy provider surface is removed in a later task.
 */
export type { LLMResult } from './structured-model-client';

export interface AgentToolDefinition {
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
}

export interface AgentToolLoopParams {
  systemPrompt: string;
  prompt: string;
  tools: Record<string, AgentToolDefinition>;
  maxSteps?: number;
  maxRetries?: number;
  maxParallelToolCalls?: number;
}

export interface AgentToolLoopResult {
  usage?: TokenUsage;
}

/**
 * Temporary compile bridge, preserved only until later tasks remove the
 * autonomous agent surface. It extends the permanent
 * {@link StructuredModelClient} (single structured output) with the legacy
 * `runAgentToolLoop` method still consumed by `src/agent/`. Do not expand this
 * surface; `runAgentToolLoop` and the `Agent*` types above are deleted once the
 * agent tree is removed (audit Finding #2; Product Decision).
 */
export interface LLMProvider extends StructuredModelClient {
  runAgentToolLoop(params: AgentToolLoopParams): Promise<AgentToolLoopResult>;
}
