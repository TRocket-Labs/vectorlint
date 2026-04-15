import type { Logger } from '../logging/logger';
import type { EnvConfig } from '../schemas/env-schemas';
import type { AIObservability } from './ai-observability';
import { LangfuseObservability } from './langfuse-observability';
import { NoopObservability } from './noop-observability';

export function createObservability(env: EnvConfig, logger?: Logger): AIObservability {
  if (env.OBSERVABILITY_BACKEND !== 'langfuse') {
    return new NoopObservability();
  }

  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    throw new Error('Langfuse observability requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY');
  }

  return new LangfuseObservability({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    ...(env.LANGFUSE_BASE_URL ? { baseUrl: env.LANGFUSE_BASE_URL } : {}),
    logger,
  });
}
