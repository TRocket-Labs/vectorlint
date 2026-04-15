import { describe, expect, it } from 'vitest';
import { ProviderType } from '../../src/providers/provider-factory';
import type { EnvConfig } from '../../src/schemas/env-schemas';
import { createObservability } from '../../src/observability/factory';
import { LangfuseObservability } from '../../src/observability/langfuse-observability';
import { NoopObservability } from '../../src/observability/noop-observability';

describe('createObservability', () => {
  const baseEnv: EnvConfig = {
    LLM_PROVIDER: ProviderType.OpenAI,
    OPENAI_API_KEY: 'sk-test-key',
    OPENAI_MODEL: 'gpt-4o',
  };

  it('returns NoopObservability when no backend is configured', () => {
    expect(createObservability(baseEnv)).toBeInstanceOf(NoopObservability);
  });

  it('returns NoopObservability when backend is not langfuse', () => {
    const env = {
      ...baseEnv,
      OBSERVABILITY_BACKEND: undefined,
    };

    expect(createObservability(env)).toBeInstanceOf(NoopObservability);
  });

  it('returns LangfuseObservability when OBSERVABILITY_BACKEND is langfuse', () => {
    const env: EnvConfig = {
      ...baseEnv,
      OBSERVABILITY_BACKEND: 'langfuse',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
      LANGFUSE_SECRET_KEY: 'sk-lf-test',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
    };

    expect(createObservability(env)).toBeInstanceOf(LangfuseObservability);
  });

  it('throws when langfuse backend is selected without required keys', () => {
    const env = {
      ...baseEnv,
      OBSERVABILITY_BACKEND: 'langfuse',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
    } as EnvConfig;

    expect(() => createObservability(env)).toThrow(/Langfuse observability requires/);
  });

  it('allows langfuse backend without explicit base URL', () => {
    const env: EnvConfig = {
      ...baseEnv,
      OBSERVABILITY_BACKEND: 'langfuse',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
      LANGFUSE_SECRET_KEY: 'sk-lf-test',
    };

    expect(createObservability(env)).toBeInstanceOf(LangfuseObservability);
  });
});
