import type { Logger } from '../logging/logger';
import type { AIExecutionContext, AIObservability } from './ai-observability';

export interface LangfuseObservabilityConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  logger?: Logger;
}

export class LangfuseObservability implements AIObservability {
  constructor(private readonly _config: LangfuseObservabilityConfig) {}

  init(): void {}

  decorateCall(_context: AIExecutionContext): Record<string, unknown> {
    return {};
  }

  shutdown(): void {}
}
