import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../utils';

const START_MOCK = vi.hoisted(() => vi.fn());
const SHUTDOWN_MOCK = vi.hoisted(() => vi.fn());
const NODE_SDK_CTOR_MOCK = vi.hoisted(() => vi.fn(() => ({
  start: START_MOCK,
  shutdown: SHUTDOWN_MOCK,
})));
const LANGFUSE_SPAN_PROCESSOR_CTOR_MOCK = vi.hoisted(() => vi.fn(() => ({ mocked: true })));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: NODE_SDK_CTOR_MOCK,
}));

vi.mock('@langfuse/otel', () => ({
  LangfuseSpanProcessor: LANGFUSE_SPAN_PROCESSOR_CTOR_MOCK,
}));

import { LangfuseObservability } from '../../src/observability/langfuse-observability';

describe('LangfuseObservability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    START_MOCK.mockImplementation(() => undefined);
    SHUTDOWN_MOCK.mockResolvedValue(undefined);
  });

  it('returns AI SDK telemetry options with full payload recording enabled', () => {
    const subject = new LangfuseObservability({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
    });

    expect(subject.decorateCall({
      operation: 'structured-eval',
      provider: 'openai',
      model: 'gpt-4o',
      evaluator: 'clarity',
      rule: 'no-fluff',
    })).toEqual({
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'vectorlint.structured-eval',
        metadata: {
          provider: 'openai',
          model: 'gpt-4o',
          evaluator: 'clarity',
          rule: 'no-fluff',
        },
        recordInputs: true,
        recordOutputs: true,
      },
    });
  });

  it('starts OTEL only once when init is called multiple times', async () => {
    const subject = new LangfuseObservability({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
    });

    await subject.init();
    await subject.init();

    expect(LANGFUSE_SPAN_PROCESSOR_CTOR_MOCK).toHaveBeenCalledTimes(1);
    expect(LANGFUSE_SPAN_PROCESSOR_CTOR_MOCK).toHaveBeenCalledWith({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
    });

    expect(NODE_SDK_CTOR_MOCK).toHaveBeenCalledTimes(1);
    expect(NODE_SDK_CTOR_MOCK).toHaveBeenCalledWith(
      expect.objectContaining({
        spanProcessors: [expect.any(Object)],
      })
    );
    expect(START_MOCK).toHaveBeenCalledTimes(1);
  });

  it('shuts down the SDK when initialized', async () => {
    const subject = new LangfuseObservability({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
    });

    await subject.init();
    await subject.shutdown();

    expect(SHUTDOWN_MOCK).toHaveBeenCalledTimes(1);
  });

  it('does nothing when shutdown is called before init', async () => {
    const subject = new LangfuseObservability({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
    });

    await expect(subject.shutdown()).resolves.toBeUndefined();
    expect(SHUTDOWN_MOCK).not.toHaveBeenCalled();
  });

  it('logs and continues when SDK shutdown fails', async () => {
    SHUTDOWN_MOCK.mockRejectedValueOnce(new Error('shutdown failed'));
    const logger = createMockLogger();
    const subject = new LangfuseObservability({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      baseUrl: 'https://cloud.langfuse.com',
      logger,
    });

    await subject.init();
    await expect(subject.shutdown()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[vectorlint] Failed to shutdown Langfuse observability SDK',
      expect.objectContaining({
        error: 'shutdown failed',
      })
    );
  });
});
