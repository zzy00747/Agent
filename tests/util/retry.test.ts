import { describe, it, expect } from 'vitest';
import { withRetry, RetryExhaustedError } from '../../src/util/retry.js';

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const result = await withRetry(async () => 'ok', { maxRetries: 3 });
    expect(result).toBe('ok');
  });

  it('retries until success', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('transient');
      }
      return 'ok';
    }, { maxRetries: 3 });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws RetryExhaustedError when retries are exhausted', async () => {
    let attempts = 0;
    await expect(
      withRetry(async () => {
        attempts += 1;
        throw new Error('persistent');
      }, { maxRetries: 2 })
    ).rejects.toThrow(RetryExhaustedError);

    expect(attempts).toBe(3);
  });

  it('respects custom shouldRetry predicate', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error('skip');
        },
        {
          maxRetries: 3,
          shouldRetry: (error) =>
            error instanceof Error && error.message !== 'skip',
        }
      )
    ).rejects.toThrow(RetryExhaustedError);

    expect(attempts).toBe(1);
  });

  it('calls onRetry callback', async () => {
    const retries: number[] = [];
    await withRetry(
      async () => {
        throw new Error('fail');
      },
      {
        maxRetries: 2,
        onRetry: (_error, attempt) => {
          retries.push(attempt);
        },
      }
    ).catch(() => {});

    expect(retries).toEqual([1, 2]);
  });
});
