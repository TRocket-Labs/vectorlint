import type { TokenUsage } from './token-usage';

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
  text?: string;
  usage?: TokenUsage;
}

export interface LLMProvider {
  runPromptStructured<T = unknown>(
    systemPrompt: string,
    userMessage: string,
    schema: { name: string; schema: Record<string, unknown> }
  ): Promise<LLMResult<T>>;
  runAgentToolLoop(params: AgentToolLoopParams): Promise<AgentToolLoopResult>;
}
