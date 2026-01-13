import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/evaluators/retry';

describe('withRetry', () => {
  it('should return result on first successful attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await withRetry(operation, { context: 'test operation' });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and return result when successful', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, {
      maxRetries: 3,
      context: 'test operation',
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should exhaust all retries and throw last error', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(
      withRetry(operation, { maxRetries: 3, context: 'test operation' })
    ).rejects.toThrow('persistent failure');

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should use default maxRetries of 3 when not specified', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('failure'))
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, { context: 'test operation' });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should return data matching operation return type', async () => {
    interface TestData {
      id: number;
      name: string;
    }

    const expectedData: TestData = { id: 1, name: 'test' };
    const operation = vi.fn().mockResolvedValue(expectedData);

    const result = await withRetry<TestData>(operation, {
      context: 'typed operation',
    });

    expect(result).toEqual(expectedData);
    expect(result.id).toBe(1);
    expect(result.name).toBe('test');
  });

  it('should handle custom maxRetries value', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('failure'))
      .mockRejectedValueOnce(new Error('failure'))
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, {
      maxRetries: 5,
      context: 'custom retries',
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('should throw immediately on first failure when maxRetries is 1', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('immediate failure'));

    await expect(
      withRetry(operation, { maxRetries: 1, context: 'single attempt' })
    ).rejects.toThrow('immediate failure');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should include context in error logging (visual test)', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('context test'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      withRetry(operation, { maxRetries: 2, context: 'detection phase' })
    ).rejects.toThrow();

    // Verify context was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('detection phase')
    );

    consoleSpy.mockRestore();
  });

  // Property 5: Retry mechanism eventually succeeds when operation succeeds within retry limit
  it('Property 5: Retry mechanism - operation succeeds before retry limit', async () => {
    // This test verifies that if the operation succeeds within the retry limit,
    // the retry mechanism returns the successful result

    const maxRetries = 5;
    const successOnAttempt = 3; // Will succeed on the 3rd attempt

    let attemptCount = 0;
    const operation = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < successOnAttempt) {
        throw new Error('not yet');
      }
      return Promise.resolve(`success at attempt ${attemptCount}`);
    });

    const result = await withRetry(operation, {
      maxRetries,
      context: 'property test',
    });

    expect(result).toBe('success at attempt 3');
    expect(operation).toHaveBeenCalledTimes(successOnAttempt);
  });
});
