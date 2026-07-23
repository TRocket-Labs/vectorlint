export interface AIExecutionContext {
  operation: 'structured-review' | 'tool-calling';
  provider: string;
  model: string;
  reviewer?: string;
  rule?: string;
  recordPayloadTelemetry?: boolean;
}

export interface AIObservability {
  init(): Promise<void> | void;
  decorateCall(context: AIExecutionContext): Record<string, unknown>;
  shutdown?(): Promise<void> | void;
}
