import * as path from 'node:path';
import * as fs from 'node:fs';
import { Logger } from './util/logger.js';
import { NoopRenderer, type AgentRenderer } from './util/agent-renderer.js';
import { withRetry } from './util/retry.js';
import { LLMClient } from './llm-client/llm-client.js';
import type { RetryConfig } from './config.js';
import type { Message, ToolCall } from './schema/index.js';
import type { Tool, ToolResult } from './tools/index.js';

function buildSystemPrompt(basePrompt: string, workspaceDir: string): string {
  if (basePrompt.includes('Current Workspace')) {
    return basePrompt;
  }
  return `${basePrompt}

## Current Workspace
You are currently working in: \`${workspaceDir}\`
All relative paths will be resolved relative to this directory.`;
}

export class Agent {
  public llmClient: LLMClient;
  public systemPrompt: string;
  public maxSteps: number;
  public messages: Message[];
  public workspaceDir: string;
  public tools: Map<string, Tool>;
  private renderer: AgentRenderer;
  private retryConfig: RetryConfig;

  constructor(
    llmClient: LLMClient,
    systemPrompt: string,
    tools: Tool[],
    maxSteps: number,
    workspaceDir: string,
    renderer?: AgentRenderer,
    retryConfig?: RetryConfig
  ) {
    this.llmClient = llmClient;
    this.maxSteps = maxSteps;
    this.tools = new Map();
    this.renderer = renderer ?? new NoopRenderer();
    this.retryConfig = retryConfig ?? { enabled: true, maxRetries: 3 };

    // Ensure workspace exists
    this.workspaceDir = path.resolve(workspaceDir);
    fs.mkdirSync(this.workspaceDir, { recursive: true });

    // Inject workspace dir into system prompt
    this.systemPrompt = buildSystemPrompt(systemPrompt, workspaceDir);
    this.messages = [{ role: 'system', content: this.systemPrompt }];

    // Register tools with the agent
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  addUserMessage(content: string): void {
    Logger.log('CHAT', 'User:', content);
    this.messages.push({ role: 'user', content });
  }

  getMessages(): Message[] {
    return this.messages;
  }

  setMessages(messages: Message[]): void {
    this.messages = messages;
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async executeTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        content: '',
        error: `Unknown tool: ${name}`,
      };
    }

    const run = async (): Promise<ToolResult> => {
      try {
        return await tool.execute(params);
      } catch (error) {
        const err = error as Error;
        const details = err?.message ? err.message : String(error);
        const stack = err?.stack ? `\n\nStack:\n${err.stack}` : '';
        return {
          success: false,
          content: '',
          error: `Tool execution failed: ${details}${stack}`,
        };
      }
    };

    let result = await run();
    if (
      result.success ||
      !result.retriable ||
      !this.retryConfig.enabled ||
      this.retryConfig.maxRetries <= 0
    ) {
      return result;
    }

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      Logger.log(
        'retry',
        `Tool ${name} failed with retriable error, retrying (${attempt}/${this.retryConfig.maxRetries})`,
        result.error ?? ''
      );
      result = await run();
      if (result.success || !result.retriable) break;
    }

    return result;
  }

  async run(): Promise<string> {
    for (let step = 0; step < this.maxSteps; step++) {
      this.renderer.onStepStart(step + 1, this.maxSteps);

      const toolList = this.listTools();

      const runStream = async (): Promise<{
        fullContent: string;
        fullThinking: string;
        toolCalls: ToolCall[] | null;
        hasThinking: boolean;
      }> => {
        let content = '';
        let thinking = '';
        let calls: ToolCall[] | null = null;
        let thinkingStarted = false;

        for await (const chunk of this.llmClient.generateStream(
          this.messages,
          toolList
        )) {
          if (chunk.thinking) {
            this.renderer.onThinkingChunk(chunk.thinking);
            thinking += chunk.thinking;
            thinkingStarted = true;
          }

          if (chunk.content) {
            if (content === '') {
              this.renderer.onResponseStart(thinkingStarted);
            }
            this.renderer.onResponseChunk(chunk.content);
            content += chunk.content;
          }

          if (chunk.tool_calls) {
            calls = chunk.tool_calls;
          }
        }

        return {
          fullContent: content,
          fullThinking: thinking,
          toolCalls: calls,
          hasThinking: thinkingStarted,
        };
      };

      let streamResult: Awaited<ReturnType<typeof runStream>>;

      if (this.retryConfig.enabled && this.retryConfig.maxRetries > 0) {
        streamResult = await withRetry(runStream, {
          maxRetries: this.retryConfig.maxRetries,
          onRetry: (error, attempt) => {
            Logger.log(
              'retry',
              `LLM stream failed, retrying (${attempt}/${this.retryConfig.maxRetries})`,
              error instanceof Error ? error.message : String(error)
            );
          },
        });
      } else {
        streamResult = await runStream();
      }

      const { fullContent, fullThinking, toolCalls } = streamResult;

      this.messages.push({
        role: 'assistant',
        content: fullContent,
        thinking: fullThinking || undefined,
        tool_calls: toolCalls || undefined,
      });

      const hasToolCalls = toolCalls !== null && toolCalls.length > 0;
      this.renderer.onStepEnd(hasToolCalls);

      if (!hasToolCalls) {
        this.renderer.onComplete(fullContent);
        return fullContent;
      }

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id;
        const functionName = toolCall.function.name;
        const args = toolCall.function.arguments || {};

        this.renderer.onToolCall(functionName, args);
        const result = await this.executeTool(functionName, args);
        this.renderer.onToolResult(functionName, result);

        this.messages.push({
          role: 'tool',
          content: result.success
            ? result.content
            : `Error: ${result.error ?? 'Unknown error'}`,
          tool_call_id: toolCallId,
          tool_name: functionName,
        });
      }
    }

    const message = `Task couldn't be completed after ${this.maxSteps} steps.`;
    this.renderer.onMaxStepsReached(this.maxSteps);
    return message;
  }
}
