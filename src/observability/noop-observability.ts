import type { AIExecutionContext, AIObservability } from './ai-observability';

export class NoopObservability implements AIObservability {
  init(): void {}

  decorateCall(context: AIExecutionContext): Record<string, unknown> {
    void context;
    return {};
  }

  shutdown(): void {}
}
