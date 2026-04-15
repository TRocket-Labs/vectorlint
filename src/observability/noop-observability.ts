import type { AIExecutionContext, AIObservability } from './ai-observability';

export class NoopObservability implements AIObservability {
  init(): void {}

  decorateCall(_context: AIExecutionContext): Record<string, unknown> {
    return {};
  }

  shutdown(): void {}
}
