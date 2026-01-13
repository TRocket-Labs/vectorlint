/**
 * Retry utility with logging for LLM operations.
 *
 * Provides exponential backoff retry logic with detailed logging for debugging
 * transient failures in LLM API calls.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Context string for logging (e.g., "detection phase", "suggestion phase") */
  context: string;
}

/**
 * Wraps an async operation with retry logic and logging.
 *
 * On each retry attempt, logs the attempt number and context to help with
 * debugging transient failures. Throws after all retries are exhausted.
 *
 * @param operation - Async function to execute with retry logic
 * @param options - Retry configuration options
 * @returns Promise resolving to the operation result
 * @throws The last error encountered after all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries = 3, context } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await operation();
      if (attempt > 1) {
        console.log(
          `[vectorlint] ${context}: Success on attempt ${attempt}/${maxRetries}`
        );
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(
          `[vectorlint] ${context}: Attempt ${attempt}/${maxRetries} failed, retrying...`
        );
      } else {
        console.log(
          `[vectorlint] ${context}: All ${maxRetries} attempts exhausted`
        );
      }
    }
  }

  throw lastError;
}
