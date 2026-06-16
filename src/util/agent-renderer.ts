import type { ToolResult } from '../tools/base.js';
import { truncateTextByTokens } from './truncate.js';
import { Colors, drawStepHeader } from './terminal.js';

/**
 * Renderer interface for observing Agent runtime events.
 *
 * Implementations decide how to present (or record) the agent's progress.
 * Keeping this interface pure allows the same Agent core to drive a terminal UI,
 * a web UI, a silent test runner, or a logging backend.
 */
import type { StepStats } from '../schema/schema.js';
import { stripMarkdown } from './markdown.js';

export type OutputFormat = 'markdown' | 'text';

export interface AgentRenderer {
  onStepStart(step: number, maxSteps: number): void;
  onThinkingStart(): void;
  onThinkingChunk(chunk: string): void;
  onResponseStart(hasThinking: boolean): void;
  onResponseChunk(chunk: string): void;
  onToolCall(name: string, args: Record<string, unknown>): void;
  onToolResult(name: string, result: ToolResult): void;
  onStepEnd(hasToolCalls: boolean): void;
  onStepStats(stats: StepStats): void;
  onComplete(response: string): void;
  onMaxStepsReached(maxSteps: number): void;
}

/**
 * No-op renderer. Use this for tests or programmatic invocations
 * where no output is desired.
 */
export class NoopRenderer implements AgentRenderer {
  onStepStart(): void {}
  onThinkingStart(): void {}
  onThinkingChunk(): void {}
  onResponseStart(): void {}
  onResponseChunk(): void {}
  onToolCall(): void {}
  onToolResult(): void {}
  onStepEnd(): void {}
  onStepStats(): void {}
  onComplete(): void {}
  onMaxStepsReached(): void {}
}

const SEPARATOR = `${Colors.DIM}─${'─'.repeat(60)}${Colors.RESET}`;
const MAX_ARG_LENGTH = 200;
const MAX_DISPLAY_RESULT_TOKENS = 75; // ≈ 300 characters

/**
 * Default terminal renderer. Reproduces the original CLI output style:
 * step headers, colored thinking/response streams, tool call details,
 * and success/error indicators.
 */
export class TerminalAgentRenderer implements AgentRenderer {
  private isThinkingPrinted = false;
  private isResponsePrinted = false;

  constructor(
    private verbose = false,
    private format: OutputFormat = 'markdown'
  ) {}

  private formatText(text: string): string {
    return this.format === 'text' ? stripMarkdown(text) : text;
  }

  onStepStart(step: number, maxSteps: number): void {
    console.log();
    console.log(drawStepHeader(step, maxSteps));
  }

  onThinkingStart(): void {
    this.isThinkingPrinted = false;
  }

  onThinkingChunk(chunk: string): void {
    if (!this.isThinkingPrinted) {
      console.log();
      console.log(SEPARATOR);
      console.log();
      console.log(
        `${Colors.BOLD}${Colors.BRIGHT_MAGENTA}🧠 Thinking:${Colors.RESET}`
      );
      this.isThinkingPrinted = true;
    }
    process.stdout.write(this.formatText(chunk));
  }

  onResponseStart(hasThinking: boolean): void {
    if (hasThinking && !this.isResponsePrinted) {
      console.log();
      console.log();
      console.log(SEPARATOR);
      console.log();
      console.log(
        `${Colors.BOLD}${Colors.BRIGHT_BLUE}📝 Response:${Colors.RESET}`
      );
    } else if (!hasThinking && !this.isResponsePrinted) {
      console.log();
      console.log(
        `${Colors.BOLD}${Colors.BRIGHT_BLUE}📝 Response:${Colors.RESET}`
      );
    }
    this.isResponsePrinted = true;
  }

  onResponseChunk(chunk: string): void {
    process.stdout.write(this.formatText(chunk));
  }

  onToolCall(name: string, args: Record<string, unknown>): void {
    console.log(
      `\n${Colors.BOLD}${Colors.BRIGHT_YELLOW}🔧 Tool: ${name}${Colors.RESET}`
    );

    console.log(`${Colors.DIM}   Arguments:${Colors.RESET}`);
    const truncatedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      const valueStr = String(value);
      if (valueStr.length > MAX_ARG_LENGTH) {
        truncatedArgs[key] = `${valueStr.slice(0, MAX_ARG_LENGTH)}...`;
      } else {
        truncatedArgs[key] = value;
      }
    }
    const argsJson = JSON.stringify(truncatedArgs, null, 2);
    for (const line of argsJson.split('\n')) {
      console.log(`   ${Colors.DIM}${line}${Colors.RESET}`);
    }
  }

  onToolResult(_name: string, result: ToolResult): void {
    if (result.success) {
      const resultText = this.formatText(
        truncateTextByTokens(result.content, MAX_DISPLAY_RESULT_TOKENS, 'tail')
      );
      const suffix =
        resultText === this.formatText(result.content)
          ? ''
          : `${Colors.DIM}...${Colors.RESET}`;
      console.log(
        `${Colors.BRIGHT_GREEN}✓${Colors.RESET} ${Colors.BOLD}${Colors.BRIGHT_GREEN}Success:${Colors.RESET} ${resultText}${suffix}\n`
      );
    } else {
      console.log(
        `${Colors.BRIGHT_RED}✗${Colors.RESET} ${Colors.BOLD}${Colors.BRIGHT_RED}Error:${Colors.RESET} ${Colors.RED}${result.error ?? 'Unknown error'}${Colors.RESET}\n`
      );
    }
  }

  onStepEnd(hasToolCalls: boolean): void {
    if (!hasToolCalls) {
      console.log();
    }
    this.isThinkingPrinted = false;
    this.isResponsePrinted = false;
  }

  onStepStats(stats: StepStats): void {
    if (!this.verbose) {
      return;
    }

    const usage = stats.usage;
    const usageText = usage
      ? ` | tokens: ${usage.promptTokens ?? '-'} / ${usage.completionTokens ?? '-'} / ${usage.totalTokens ?? '-'}`
      : '';

    console.log(
      `${Colors.DIM}⏱ Step ${stats.step}: LLM ${stats.llmMs.toFixed(0)}ms · tools ${stats.toolsMs.toFixed(0)}ms · total ${stats.totalMs.toFixed(0)}ms${usageText}${Colors.RESET}`
    );
  }

  onComplete(response: string): void {
    // Terminal already streamed the response, nothing extra to print.
    void response;
  }

  onMaxStepsReached(maxSteps: number): void {
    console.log(`Task couldn't be completed after ${maxSteps} steps.`);
  }
}
