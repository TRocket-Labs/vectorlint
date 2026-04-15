export interface AIExecutionContext {
  operation: 'structured-eval' | 'agent-tool-loop';
  provider: string;
  model: string;
  evaluator?: string;
  rule?: string;
}

export interface AIObservability {
  init(): Promise<void> | void;
  decorateCall(context: AIExecutionContext): Record<string, unknown>;
  shutdown?(): Promise<void> | void;
}
