import type { Message } from '../schema/index.js';

/**
 * Rough token estimator. No external tokenizer is used.
 * Heuristic: 1 token ≈ 4 characters of English text.
 */
export function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateMessageTokens(message);
  }
  return Math.ceil(total);
}

function estimateMessageTokens(message: Message): number {
  let text = '';

  if (message.role === 'system') {
    text = message.content;
  } else if (message.role === 'user') {
    text = typeof message.content === 'string' ? message.content : '';
  } else if (message.role === 'assistant') {
    text = `${message.content ?? ''}${message.thinking ?? ''}`;
  } else if (message.role === 'tool') {
    text = message.content;
  }

  return Math.ceil(text.length / 4);
}

/**
 * Compress message history to fit within a token budget.
 *
 * Strategy:
 * 1. Always keep the system message.
 * 2. Keep the most recent messages that fit within maxTokens.
 * 3. Drop older messages and replace them with a single summary marker.
 */
export function compressMessages(
  messages: Message[],
  maxTokens: number
): Message[] {
  if (maxTokens <= 0 || messages.length === 0) {
    return messages;
  }

  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  const systemTokenCount = estimateTokens(systemMessages);
  const budget = Math.max(0, maxTokens - systemTokenCount);

  const kept: Message[] = [];
  let usedTokens = 0;

  // Walk backwards from the most recent non-system message.
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const message = nonSystemMessages[i];
    const tokens = estimateMessageTokens(message);

    if (usedTokens + tokens <= budget || kept.length === 0) {
      kept.unshift(message);
      usedTokens += tokens;
    } else {
      break;
    }
  }

  const droppedCount = nonSystemMessages.length - kept.length;
  if (droppedCount > 0) {
    const summary: Message = {
      role: 'user',
      content: `[Earlier conversation context omitted: ${droppedCount} previous messages were summarized to stay within the ${maxTokens} token budget.]`,
    };
    kept.unshift(summary);
  }

  return [...systemMessages, ...kept];
}
