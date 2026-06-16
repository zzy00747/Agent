import type { ToolResult } from '../tools/base.js';
import { Colors, drawStepHeader } from './terminal.js';

/**
 * Renderer interface for observing Agent runtime events.
 *
 * Implementations decide how to present (or record) the agent's progress.
 * Keeping this interface pure allows the same Agent core to drive a terminal UI,
 * a web UI, a silent test runner, or a logging backend.
 */
export interface AgentRenderer {
  onStepStart(step: number, maxSteps: number): void;
  onThinkingStart(): void;
  onThinkingChunk(chunk: string): void;
  onResponseStart(hasThinking: boolean): void;
  onResponseChunk(chunk: string): void;
  onToolCall(name: string, args: Record<string, unknown>): void;
  onToolResult(name: string, result: ToolResult): void;
  onStepEnd(hasToolCalls: boolean): void;
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
  onComplete(): void {}
  onMaxStepsReached(): void {}
}

const SEPARATOR = `${Colors.DIM}─${'─'.repeat(60)}${Colors.RESET}`;
const MAX_ARG_LENGTH = 200;
const MAX_RESULT_LENGTH = 300;

/**
 * Default terminal renderer. Reproduces the original CLI output style:
 * step headers, colored thinking/response streams, tool call details,
 * and success/error indicators.
 */
export class TerminalAgentRenderer implements AgentRenderer {
  private isThinkingPrinted = false;
  private isResponsePrinted = false;

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
    process.stdout.write(chunk);
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
    process.stdout.write(chunk);
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
      let resultText = result.content;
      if (resultText.length > MAX_RESULT_LENGTH) {
        resultText = `${resultText.slice(
          0,
          MAX_RESULT_LENGTH
        )}${Colors.DIM}...${Colors.RESET}`;
      }
      console.log(
        `${Colors.BRIGHT_GREEN}✓${Colors.RESET} ${Colors.BOLD}${Colors.BRIGHT_GREEN}Success:${Colors.RESET} ${resultText}\n`
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

  onComplete(response: string): void {
    // Terminal already streamed the response, nothing extra to print.
    void response;
  }

  onMaxStepsReached(maxSteps: number): void {
    console.log(`Task couldn't be completed after ${maxSteps} steps.`);
  }
}
