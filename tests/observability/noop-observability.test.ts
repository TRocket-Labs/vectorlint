import { describe, expect, it } from 'vitest';
import { NoopObservability } from '../../src/observability/noop-observability';

describe('NoopObservability', () => {
  const subject = new NoopObservability();

  it('returns an empty option object for any AI execution context', () => {
    expect(subject.decorateCall({
      operation: 'structured-eval',
      provider: 'openai',
      model: 'gpt-4o',
    })).toEqual({});
  });

  it('allows init and shutdown to be called without throwing', async () => {
    expect(() => subject.init()).not.toThrow();
    await expect(Promise.resolve(subject.shutdown?.())).resolves.toBeUndefined();
  });
});
