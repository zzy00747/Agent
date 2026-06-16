import type { Message } from '../schema/index.js';
import { compressMessages, estimateTokens } from './history-compressor.js';
import { truncateTextByTokens } from './truncate.js';

export interface ContextManagerOptions {
  /** Maximum tokens allowed for any single tool result message. 0 disables. */
  maxToolResultTokens?: number;
  /** Maximum tokens allowed for the full message history. 0 disables. */
  maxHistoryTokens?: number;
}

/**
 * Prepare messages for an LLM call by enforcing context budgets.
 *
 * 1. Truncate individual tool-result messages that exceed
 *    `maxToolResultTokens`. This keeps oversized tool output (large files,
 *    long command output, etc.) outside the system prompt and bounded.
 * 2. If `maxHistoryTokens` is set and the total exceeds the budget,
 *    compress the history by dropping older non-system messages.
 */
export function prepareMessages(
  messages: Message[],
  options: ContextManagerOptions = {}
): Message[] {
  const { maxToolResultTokens = 0, maxHistoryTokens = 0 } = options;

  let prepared = messages;

  if (maxToolResultTokens > 0) {
    prepared = prepared.map((message) => {
      if (message.role !== 'tool' || typeof message.content !== 'string') {
        return message;
      }

      const truncated = truncateTextByTokens(
        message.content,
        maxToolResultTokens,
        'head-tail'
      );
      if (truncated === message.content) {
        return message;
      }

      return {
        ...message,
        content: truncated,
      };
    });
  }

  if (maxHistoryTokens > 0) {
    const currentTokens = estimateTokens(prepared);
    if (currentTokens > maxHistoryTokens) {
      prepared = compressMessages(prepared, maxHistoryTokens);
    }
  }

  return prepared;
}
