import * as path from 'node:path';
import * as fs from 'node:fs';
import { Logger } from './util/logger.js';
import { NoopRenderer, type AgentRenderer } from './util/agent-renderer.js';
import { LLMClient } from './llm-client/llm-client.js';
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

  constructor(
    llmClient: LLMClient,
    systemPrompt: string,
    tools: Tool[],
    maxSteps: number,
    workspaceDir: string,
    renderer?: AgentRenderer
  ) {
    this.llmClient = llmClient;
    this.maxSteps = maxSteps;
    this.tools = new Map();
    this.renderer = renderer ?? new NoopRenderer();

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
  }

  async run(): Promise<string> {
    for (let step = 0; step < this.maxSteps; step++) {
      this.renderer.onStepStart(step + 1, this.maxSteps);

      let fullContent = '';
      let fullThinking = '';
      let toolCalls: ToolCall[] | null = null;
      let hasThinking = false;

      const toolList = this.listTools();
      for await (const chunk of this.llmClient.generateStream(
        this.messages,
        toolList
      )) {
        if (chunk.thinking) {
          this.renderer.onThinkingChunk(chunk.thinking);
          fullThinking += chunk.thinking;
          hasThinking = true;
        }

        if (chunk.content) {
          if (fullContent === '') {
            this.renderer.onResponseStart(hasThinking);
          }
          this.renderer.onResponseChunk(chunk.content);
          fullContent += chunk.content;
        }

        if (chunk.tool_calls) {
          toolCalls = chunk.tool_calls;
        }
      }

      this.messages.push({
        role: 'assistant',
        content: fullContent,
        thinking: fullThinking || undefined,
        tool_calls: toolCalls || undefined,
      });

      const hasToolCalls = !!(toolCalls && toolCalls.length > 0);
      this.renderer.onStepEnd(hasToolCalls);

      if (!toolCalls || toolCalls.length === 0) {
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
