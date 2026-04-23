import type { TokenUsage } from './token-usage';
import type { EvalContext } from './request-builder';

export interface LLMResult<T> {
  data: T;
  usage?: TokenUsage;
}

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

export interface LLMProvider {
  runPromptStructured<T = unknown>(content: string, promptText: string, schema: { name: string; schema: Record<string, unknown> }, context?: EvalContext): Promise<LLMResult<T>>;
  runAgentToolLoop(params: AgentToolLoopParams): Promise<AgentToolLoopResult>;
}
