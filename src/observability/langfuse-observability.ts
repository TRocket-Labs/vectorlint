import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { createNoopLogger, type Logger } from '../logging/logger';
import type { AIExecutionContext, AIObservability } from './ai-observability';
import { handleUnknownError } from '../errors';

export interface LangfuseObservabilityConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  logger?: Logger;
}

export class LangfuseObservability implements AIObservability {
  private sdk?: NodeSDK;
  private initPromise?: Promise<void>;
  private readonly logger: Logger;

  constructor(private readonly config: LangfuseObservabilityConfig) {
    this.logger = config.logger ?? createNoopLogger();
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.sdk) {
      return;
    }

    this.initPromise = Promise.resolve().then(() => {
      const spanProcessor = new LangfuseSpanProcessor({
        publicKey: this.config.publicKey,
        secretKey: this.config.secretKey,
        ...(this.config.baseUrl ? { baseUrl: this.config.baseUrl } : {}),
      });

      const sdk = new NodeSDK({
        spanProcessors: [spanProcessor],
      });

      sdk.start();
      this.sdk = sdk;
    });

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = undefined;
      throw error;
    }
  }

  decorateCall(context: AIExecutionContext): Record<string, unknown> {
    return {
      experimental_telemetry: {
        isEnabled: true,
        functionId: `vectorlint.${context.operation}`,
        metadata: {
          provider: context.provider,
          model: context.model,
          ...(context.evaluator ? { evaluator: context.evaluator } : {}),
          ...(context.rule ? { rule: context.rule } : {}),
        },
        recordInputs: true,
        recordOutputs: true,
      },
    };
  }

  async shutdown(): Promise<void> {
    const sdk = this.sdk;
    this.sdk = undefined;
    this.initPromise = undefined;

    if (!sdk) {
      return;
    }

    try {
      await sdk.shutdown();
    } catch (error) {
      const err = handleUnknownError(error, 'Shutting down Langfuse observability SDK');
      this.logger.warn('[vectorlint] Failed to shutdown Langfuse observability SDK', {
        error: err.message,
      });
    }
  }
}
