/**
 * Retry utility for OpenAI and other external API calls.
 * Uses exponential backoff with jitter.
 */

export interface RetryOptions<T> {
  maxAttempts: number;
  baseBackoffMs: number;
  fn: () => Promise<T>;
  shouldRetry: (error: unknown) => boolean;
  onAttemptFailed?: (error: unknown, attempt: number, retrying: boolean) => void;
}

export async function withRetry<T>(options: RetryOptions<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await options.fn();
    } catch (error: unknown) {
      lastError = error;
      const canRetry = options.shouldRetry(error) && attempt < options.maxAttempts;
      options.onAttemptFailed?.(error, attempt, canRetry);

      if (!canRetry) {
        break;
      }

      const delay = computeBackoffMs(options.baseBackoffMs, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

function computeBackoffMs(baseMs: number, attempt: number): number {
  const exponential = baseMs * 2 ** (attempt - 1);
  const jitter = exponential * (Math.random() * 0.4 - 0.2);
  return Math.max(0, Math.round(exponential + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
