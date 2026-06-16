import { describe, it, expect } from 'vitest';
import { Agent } from '../src/agent.js';
import { NoopRenderer } from '../src/util/agent-renderer.js';
import { LLMClientBase } from '../src/llm-client/llm-client-base.js';
import type { Message, LLMStreamChunk, ToolCall } from '../src/schema/index.js';
import type { Tool, ToolResult } from '../src/tools/base.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

class MockLLMClient extends LLMClientBase {
  private responses: LLMStreamChunk[][];
  private callIndex = 0;

  constructor(responses: LLMStreamChunk[][]) {
    super('fake-key', 'http://localhost', 'mock-model');
    this.responses = responses;
  }

  async *generateStream(): AsyncGenerator<LLMStreamChunk> {
    const chunks = this.responses[this.callIndex] ?? [
      { content: 'default', done: true },
    ];
    this.callIndex += 1;
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  prepareRequest(): Record<string, unknown> {
    return {};
  }

  convertMessages(messages: Message[]): [string | null, Record<string, unknown>[]] {
    return [null, messages as Record<string, unknown>[]];
  }
}

class MockTool implements Tool<{ input: string }> {
  name = 'mock_tool';
  description = 'A mock tool for testing';
  parameters = {
    type: 'object' as const,
    properties: {
      input: { type: 'string', description: 'Input text' },
    },
    required: ['input'],
  };

  async execute(params: { input: string }): Promise<ToolResult> {
    return { success: true, content: `mock result: ${params.input}` };
  }
}

class FlakyTool implements Tool<{ input: string }> {
  name = 'flaky_tool';
  description = 'A mock tool that fails retriably then succeeds';
  parameters = {
    type: 'object' as const,
    properties: {
      input: { type: 'string', description: 'Input text' },
    },
    required: ['input'],
  };

  attempts = 0;

  async execute(params: { input: string }): Promise<ToolResult> {
    this.attempts += 1;
    if (this.attempts < 3) {
      return {
        success: false,
        content: '',
        error: 'transient failure',
        retriable: true,
      };
    }
    return { success: true, content: `recovered: ${params.input}` };
  }
}

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
}

describe('Agent', () => {
  it('returns a direct response without tool calls', async () => {
    const workspace = makeWorkspace();
    const client = new MockLLMClient([
      [{ content: 'Hello!', done: true }],
    ]);
    const agent = new Agent(
      client,
      'You are a test agent.',
      [new MockTool()],
      10,
      workspace,
      new NoopRenderer()
    );

    agent.addUserMessage('Hi');
    const result = await agent.run();

    expect(result).toBe('Hello!');
    expect(agent.messages).toHaveLength(3);
    expect(agent.messages[0].role).toBe('system');
    expect(agent.messages[1].role).toBe('user');
    expect(agent.messages[2].role).toBe('assistant');

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('executes a tool call and continues the loop', async () => {
    const workspace = makeWorkspace();
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'mock_tool',
        arguments: { input: 'world' },
      },
    };

    const client = new MockLLMClient([
      [{ tool_calls: [toolCall], done: true }],
      [{ content: 'Done!', done: true }],
    ]);

    const agent = new Agent(
      client,
      'You are a test agent.',
      [new MockTool()],
      10,
      workspace,
      new NoopRenderer()
    );

    agent.addUserMessage('Use the tool');
    const result = await agent.run();

    expect(result).toBe('Done!');
    expect(agent.messages.some((m) => m.role === 'tool')).toBe(true);

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('handles unknown tools gracefully', async () => {
    const workspace = makeWorkspace();
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'missing_tool',
        arguments: {},
      },
    };

    const client = new MockLLMClient([
      [{ tool_calls: [toolCall], done: true }],
      [{ content: 'Sorry', done: true }],
    ]);

    const agent = new Agent(
      client,
      'You are a test agent.',
      [new MockTool()],
      10,
      workspace,
      new NoopRenderer()
    );

    agent.addUserMessage('Call missing tool');
    const result = await agent.run();

    expect(result).toBe('Sorry');
    const toolMessage = agent.messages.find((m) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(JSON.stringify(toolMessage)).toContain('Unknown tool');

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('stops after maxSteps', async () => {
    const workspace = makeWorkspace();
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'mock_tool',
        arguments: { input: 'x' },
      },
    };

    const client = new MockLLMClient(
      Array.from({ length: 5 }, () => [{ tool_calls: [toolCall], done: true }])
    );

    const agent = new Agent(
      client,
      'You are a test agent.',
      [new MockTool()],
      2,
      workspace,
      new NoopRenderer()
    );

    agent.addUserMessage('Loop forever');
    const result = await agent.run();

    expect(result).toContain("couldn't be completed");
    expect(result).toContain('2');

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('retries retriable tool failures', async () => {
    const workspace = makeWorkspace();
    const flakyTool = new FlakyTool();
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'flaky_tool',
        arguments: { input: 'test' },
      },
    };

    const client = new MockLLMClient([
      [{ tool_calls: [toolCall], done: true }],
      [{ content: 'Done', done: true }],
    ]);

    const agent = new Agent(
      client,
      'You are a test agent.',
      [flakyTool],
      10,
      workspace,
      new NoopRenderer(),
      { enabled: true, maxRetries: 3 }
    );

    agent.addUserMessage('Use flaky tool');
    const result = await agent.run();

    expect(result).toBe('Done');
    expect(flakyTool.attempts).toBe(3);

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('does not retry non-retriable tool failures', async () => {
    const workspace = makeWorkspace();
    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'mock_tool',
        arguments: { input: 'x' },
      },
    };

    const client = new MockLLMClient([
      [{ tool_calls: [toolCall], done: true }],
      [{ content: 'Sorry', done: true }],
    ]);

    const agent = new Agent(
      client,
      'You are a test agent.',
      [new MockTool()],
      10,
      workspace,
      new NoopRenderer(),
      { enabled: true, maxRetries: 3 }
    );

    agent.addUserMessage('Call tool');
    const result = await agent.run();

    expect(result).toBe('Sorry');

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('retries LLM stream failures', async () => {
    const workspace = makeWorkspace();

    class FlakyLLMClient extends LLMClientBase {
      private attempts = 0;

      constructor() {
        super('fake-key', 'http://localhost', 'mock-model');
      }

      async *generateStream(): AsyncGenerator<{
        content?: string;
        thinking?: string;
        tool_calls?: ToolCall[];
        done: boolean;
      }> {
        this.attempts += 1;
        if (this.attempts < 3) {
          yield { content: 'partial', done: false };
          throw new Error('stream broken');
        }
        yield { content: 'complete', done: true };
      }

      prepareRequest(): Record<string, unknown> {
        return {};
      }

      convertMessages(messages: Message[]): [string | null, Record<string, unknown>[]] {
        return [null, messages as Record<string, unknown>[]];
      }
    }

    const client = new FlakyLLMClient();
    const agent = new Agent(
      client,
      'You are a test agent.',
      [new MockTool()],
      10,
      workspace,
      new NoopRenderer(),
      { enabled: true, maxRetries: 3 }
    );

    agent.addUserMessage('Hi');
    const result = await agent.run();

    expect(result).toBe('complete');

    fs.rmSync(workspace, { recursive: true, force: true });
  });
});
