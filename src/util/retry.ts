export interface RetryOptions {
  maxRetries: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

export class RetryExhaustedError extends Error {
  public readonly originalCause: unknown;
  public readonly attempts: number;

  constructor(message: string, cause: unknown, attempts: number) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.originalCause = cause;
    this.attempts = attempts;
  }
}

/**
 * Execute an async function with retry logic.
 *
 * By default retries on any error. Use shouldRetry to filter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    delayMs = 500,
    backoffMultiplier = 1.5,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt || !shouldRetry(error)) {
        break;
      }

      onRetry?.(error, attempt + 1);

      const wait = delayMs * Math.pow(backoffMultiplier, attempt);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw new RetryExhaustedError(
    `Failed after ${maxRetries + 1} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    lastError,
    maxRetries + 1
  );
}
