/**
 * Token-based text truncation utilities.
 *
 * Uses a coarse, zero-dependency heuristic: 1 token ≈ 4 characters.
 * This is good enough for context-window budgeting and display limits
 * without pulling in a model-specific tokenizer.
 */

/**
 * Estimate the number of tokens in a plain text string.
 */
export function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export type TruncationStrategy = 'head-tail' | 'tail';

/**
 * Truncate text to fit within a token budget.
 *
 * @param text - The text to truncate.
 * @param maxTokens - Maximum number of tokens to keep.
 * @param strategy - How to truncate: 'head-tail' keeps beginning and end,
 *   'tail' keeps only the beginning.
 * @returns The truncated text, or the original text if it already fits.
 */
export function truncateTextByTokens(
  text: string,
  maxTokens: number,
  strategy: TruncationStrategy = 'head-tail'
): string {
  if (!text) {
    return text;
  }

  const estimatedTokens = estimateTextTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  if (strategy === 'tail') {
    const ratio = estimatedTokens / text.length;
    const maxChars = Math.max(1, Math.floor((maxTokens / ratio) * 0.95));
    let head = text.slice(0, maxChars);
    const lastNewline = head.lastIndexOf('\n');
    if (lastNewline > 0) {
      head = head.slice(0, lastNewline);
    }
    return `${head}\n\n... [Content truncated: ~${estimatedTokens} tokens -> ~${maxTokens} tokens limit] ...\n\n`;
  }

  const ratio = estimatedTokens / text.length;
  const charsPerHalf = Math.max(1, Math.floor((maxTokens / 2 / ratio) * 0.95));

  let headPart = text.slice(0, charsPerHalf);
  const lastNewlineHead = headPart.lastIndexOf('\n');
  if (lastNewlineHead > 0) {
    headPart = headPart.slice(0, lastNewlineHead);
  }

  let tailPart = text.slice(-charsPerHalf);
  const firstNewlineTail = tailPart.indexOf('\n');
  if (firstNewlineTail > 0) {
    tailPart = tailPart.slice(firstNewlineTail + 1);
  }

  const truncationNote = `\n\n... [Content truncated: ~${estimatedTokens} tokens -> ~${maxTokens} tokens limit] ...\n\n`;
  return headPart + truncationNote + tailPart;
}
