import { describe, it, expect } from 'vitest';
import { prepareMessages } from '../src/util/context-manager.js';
import type { Message } from '../src/schema/index.js';

describe('prepareMessages', () => {
  it('truncates oversized tool result messages', () => {
    const longContent = 'x'.repeat(4000); // ~1000 tokens under the heuristic
    const messages: Message[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'read a file' },
      {
        role: 'tool',
        content: longContent,
        tool_call_id: 'call-1',
        tool_name: 'read_file',
      },
    ];

    const prepared = prepareMessages(messages, { maxToolResultTokens: 100 });
    const toolMessage = prepared.find((m) => m.role === 'tool');

    expect(toolMessage).toBeDefined();
    expect(toolMessage!.content).toContain('[Content truncated');
    expect(toolMessage!.content.length).toBeLessThan(longContent.length);
  });

  it('does not truncate tool results when disabled', () => {
    const longContent = 'x'.repeat(4000);
    const messages: Message[] = [
      { role: 'system', content: 'system prompt' },
      {
        role: 'tool',
        content: longContent,
        tool_call_id: 'call-1',
        tool_name: 'read_file',
      },
    ];

    const prepared = prepareMessages(messages, { maxToolResultTokens: 0 });
    const toolMessage = prepared.find((m) => m.role === 'tool');

    expect(toolMessage!.content).toBe(longContent);
  });

  it('compresses history when total tokens exceed the budget', () => {
    const messages: Message[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'a'.repeat(400) }, // ~100 tokens
      { role: 'assistant', content: 'b'.repeat(400) }, // ~100 tokens
      { role: 'user', content: 'c'.repeat(400) }, // ~100 tokens
    ];

    const prepared = prepareMessages(messages, { maxHistoryTokens: 150 });

    expect(prepared.some((m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Earlier conversation context omitted'))).toBe(true);
    expect(prepared.length).toBeLessThan(messages.length + 1);
  });

  it('leaves messages unchanged when budgets are disabled', () => {
    const messages: Message[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];

    const prepared = prepareMessages(messages, {});

    expect(prepared).toEqual(messages);
  });
});
