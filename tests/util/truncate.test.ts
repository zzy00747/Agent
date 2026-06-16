import { describe, it, expect } from 'vitest';
import {
  estimateTextTokens,
  truncateTextByTokens,
} from '../../src/util/truncate.js';

describe('truncateTextByTokens', () => {
  it('returns short text unchanged', () => {
    const text = 'hello world';
    expect(truncateTextByTokens(text, 100)).toBe(text);
  });

  it('truncates long text using head-tail strategy by default', () => {
    const text = 'a'.repeat(4000); // ~1000 tokens
    const result = truncateTextByTokens(text, 100);

    expect(result).toContain('[Content truncated');
    expect(result.startsWith('a')).toBe(true);
    expect(result.endsWith('a')).toBe(true);
    expect(result.length).toBeLessThan(text.length);
  });

  it('truncates long text using tail strategy', () => {
    const text = 'a'.repeat(4000);
    const result = truncateTextByTokens(text, 100, 'tail');

    expect(result).toContain('[Content truncated');
    expect(result.startsWith('a')).toBe(true);
    expect(result.endsWith('a')).toBe(false);
  });

  it('estimates tokens from text length', () => {
    expect(estimateTextTokens('')).toBe(1);
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimateTextTokens('abcdefgh')).toBe(2);
  });
});
