# Agent Guide for mini-agent-ts

This file is a reference for AI coding agents working on the `mini-agent-ts` project. It assumes no prior knowledge of the codebase.

## Project Overview

`mini-agent-ts` is a TypeScript implementation of MiniMax's open-source [Mini-Agent](https://github.com/MiniMax-AI/Mini-Agent). It is a minimal, terminal-based LLM Agent with roughly 2,000 lines of core code. The agent supports:

- **ReAct Mode**: Multi-step reasoning and tool calling for complex tasks.
- **Interleaved Chain of Thought**: Streaming of reasoning content alongside regular responses.
- **MCP Protocol**: Integration with external tool ecosystems via the Model Context Protocol.
- **Agent Skills**: Domain-specific knowledge loaded from `SKILL.md` files.
- **Multi-Provider LLMs**: OpenAI, Anthropic, MiniMax, DeepSeek, or any OpenAI-compatible API.

The project is an ESM-only Node.js package written in TypeScript. It is distributed as a CLI tool (`mini-agent-ts`) that can be installed globally via `npm link`.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.9 (ES2022, strict mode) |
| Runtime | Node.js ≥ 18 |
| Module System | ESM (`"type": "module"`) with NodeNext resolution |
| CLI Framework | Commander.js |
| Config Parsing | `yaml` + Zod validation |
| LLM SDKs | `openai`, `@anthropic-ai/sdk` |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Testing | Vitest |
| Linting/Formatting | ESLint 9 + Prettier 3 |
| Git Hooks | Husky + lint-staged |

## Project Structure

```
mini-agent-ts/
├── src/                    # Source code
│   ├── index.ts            # CLI entry point (ESM shebang → dist/index.js)
│   ├── cli.ts              # Command-line parsing, startup, tool wiring
│   ├── agent.ts            # Core ReAct loop and tool execution
│   ├── config.ts           # YAML configuration loading and Zod schemas
│   ├── llm-client/         # LLM provider adapters
│   │   ├── llm-client.ts   # Factory that selects OpenAI/Anthropic client
│   │   ├── llm-client-base.ts
│   │   ├── openai-client.ts
│   │   └── anthropic-client.ts
│   ├── schema/             # Shared types (Message, ToolCall, LLMStreamChunk)
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── skills/             # Agent Skills loader and tool
│   │   ├── index.ts
│   │   ├── skill-loader.ts
│   │   ├── get-skill-tool.ts
│   │   └── types.ts
│   ├── tools/              # Built-in tools and MCP integration
│   │   ├── index.ts
│   │   ├── base.ts         # Tool interface definitions
│   │   ├── file-tools.ts   # read_file, write_file, edit_file
│   │   ├── bash-tool.ts    # bash, bash_output, bash_kill
│   │   └── mcp/            # MCP client/transport wrappers
│   │       ├── index.ts
│   │       ├── connection.ts
│   │       ├── types.ts
│   │       └── utils.ts
│   └── util/               # Utilities
│       ├── logger.ts
│       └── terminal.ts
├── tests/                  # Vitest tests
│   ├── bash-tool.test.ts
│   ├── tools.test.ts
│   ├── tool-schema.test.ts
│   └── llm-client.test.ts
├── config/                 # Runtime configuration
│   ├── config-example.yaml
│   ├── config.yaml         # Active config (gitignored; contains API key)
│   ├── system_prompt.md
│   └── mcp-example.json
├── skills/                 # User-defined skills (gitignored)
├── skills-example/         # Example skill templates
│   ├── skill-creator/
│   └── template-skill/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── .husky/pre-commit
└── .github/workflows/      # CI workflows
```

## Build and Runtime Architecture

### Build Process

1. `npm run build` runs `tsc && chmod +x dist/index.js`.
2. TypeScript compiles `src/` into `dist/` using `NodeNext` module resolution.
3. `dist/index.js` is the executable CLI entry point (the source `src/index.ts` includes `#!/usr/bin/env node`).
4. `tsconfig.json` enables `strict`, `composite`, `incremental`, `declaration`, and `sourceMap`.

### Runtime Flow

1. `src/index.ts` calls `run()` from `src/cli.ts`.
2. CLI parses `--workspace <dir>` (defaults to `process.cwd()`).
3. `Config.findConfigFile('config.yaml')` searches for config in this order:
   - `./config/config.yaml` (current working directory)
   - `~/.mini-agent-ts/config/config.yaml`
   - `{package_root}/config/config.yaml`
4. `Config.load()` loads the YAML config and merges `MINI_AGENT_*` environment variables on top. Env vars take precedence over YAML, and nested keys use double underscores (e.g. `MINI_AGENT_RETRY__ENABLED`). `Config.fromYaml()` is still available for direct YAML loading without env merging.
5. An `LLMClient` is created based on `provider` (`openai` or `anthropic`).
6. Built-in tools are instantiated: `ReadTool`, `WriteTool`, `EditTool`, `BashTool`, `BashOutputTool`, `BashKillTool`.
7. Optional skills are loaded from `tools.skillsDir` (`./skills` by default).
8. Optional MCP tools are loaded from `tools.mcpConfigPath` (`mcp.json` by default).
9. `Agent.run()` executes the ReAct loop up to `maxSteps`, streaming LLM output and dispatching tool calls.

### Configuration

The active config lives at `config/config.yaml` (gitignored). Create it from `config/config-example.yaml`. Key fields:

```yaml
apiKey: 'YOUR_API_KEY'
apiBase: 'https://api.minimaxi.com/v1/'
model: 'MiniMax-M2.5'
provider: 'openai'   # or 'anthropic'
enableLogging: false
verbose: false      # Verbose console output (also --verbose CLI flag)
outputFormat: markdown # or 'text' for plain-text rendering
maxSteps: 100
systemPromptPath: 'system_prompt.md'
retry:
  enabled: true
  maxRetries: 3
tools:
  skillsDir: './skills'
  mcpConfigPath: 'mcp.json'
  mcp:
    connectTimeout: 10.0
    executeTimeout: 60.0
    sseReadTimeout: 120.0
    heartbeatInterval: 30.0 # seconds, 0 disables keepalive
    maxReconnectAttempts: 3
    reconnectDelay: 1000 # milliseconds
  maxToolResultTokens: 8000 # Truncate oversized tool results before sending to the LLM
```

MCP servers are configured in `config/mcp.json` (copy from `config/mcp-example.json`). Supported connection types are `stdio`, `sse`, `http`, and `streamable_http`. The connection manager sends periodic heartbeat pings, reconnects automatically on connection failures, and closes all connections on process exit.

Before every LLM call, the agent prepares the message context: oversized `tool` results are truncated to `tools.maxToolResultTokens`, and the full history is compressed if it exceeds `history.maxHistoryTokens`. Because tool results are non-system messages, they can be compressed/dropped by the history manager rather than living forever in the system prompt. Multiple tool calls requested in a single assistant message are executed concurrently, with results pushed in declaration order.

### Observability

- Run with `--verbose` (or set `verbose: true` / `MINI_AGENT_VERBOSE=true`) to mirror logs to the console.
- Each ReAct step emits `StepStats` (LLM/tools/total timing) via the `AgentRenderer` and `Logger`.
- `LLMStreamChunk` carries optional `usage` metadata. OpenAI-compatible providers can return usage via `stream_options: { include_usage: true }`; Anthropic reports usage through `message_start`/`message_delta` events. The agent aggregates per-step token counts when available.
- `enableLogging: true` writes structured logs to `logs/agent-<timestamp>.log` regardless of verbose mode.
- `outputFormat: text` (or `--text`) strips Markdown from streamed response chunks and tool-result previews before printing to the terminal.

## Build and Test Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Run the CLI via `tsx src/index.ts` |
| `npm run build` | Compile TypeScript to `dist/` and make `dist/index.js` executable |
| `npm start` | Run the compiled CLI |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once |
| `npm run lint` | Lint `src/**/*.ts` with ESLint |
| `npm run lint:fix` | Lint and auto-fix issues |
| `npm run format` | Format `src/**/*.ts` with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run preflight` | Build, test, lint, and `npm link` in one command |

## Code Style Guidelines

- **Language**: English for all code comments, documentation, and user-facing strings.
- **Imports**: Use ESM syntax. In `src/`, import sibling TypeScript files with the `.js` extension (e.g., `import { Agent } from './agent.js'`). TypeScript resolves these to `.ts` source during development and to compiled `.js` in `dist/`.
- **Formatting**: Prettier with 80-character print width, 2-space indentation, single quotes, trailing commas where valid in ES5, and LF line endings.
- **Types**: Strict TypeScript is required. Avoid `any`; use `unknown` when types are not known. Explicit function return types are not required by ESLint but are common.
- **Naming**: Classes are `PascalCase`. Tool names use `snake_case`. File names use `kebab-case`.
- **Error Handling**: Prefer returning structured `ToolResult` objects over throwing inside tools. In async code, avoid floating promises (ESLint enforces this).
- **Git Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`).

## Git Workflow

After every code modification, the agent should:

1. Check whether related documentation or configuration files (e.g., `README.md`, `AGENTS.md`, `package.json`, `config/config-example.yaml`) need to be updated for consistency. If so, update them first.
2. Run tests with `npm run test:run`.
3. If tests pass, stage the changed files with `git add`.
4. Create a local `git commit` using Conventional Commits format (e.g., `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`).

Do NOT push to remote unless explicitly asked by the user.

## Testing Instructions

- Tests are written with Vitest and live in `tests/`.
- `tests/bash-tool.test.ts` is skipped on Windows because the bash implementation assumes a Unix shell.
- `tests/llm-client.test.ts` is an integration test that calls the live LLM API configured in `config/config.yaml`. It is automatically skipped if the config is missing or invalid.
- CI runs `npm run test:run` and `npm run preflight` on every pull request and push to `main`.

## Security Considerations

- **API Keys**: `config/config.yaml` is gitignored, but the file on disk may contain a real API key. Never commit it or expose it in logs. The config search path also supports `~/.mini-agent-ts/config/` for storing secrets outside the repo.
- **Shell Execution**: `BashTool` executes arbitrary shell commands in the user environment. Validate and sanitize any command strings built from user input.
- **File Access**: File tools resolve paths relative to the workspace directory but also accept absolute paths. Be mindful of path traversal when handling user-provided paths.
- **MCP Tools**: MCP servers run external processes or connect to remote endpoints. Treat their tools with the same caution as local shell commands.
- **Workspace**: The CLI creates the workspace directory if it does not exist. Ensure the agent runs in an intentional directory.

## Useful Notes for Agents

- The `Agent` class in `src/agent.ts` is intentionally small. Most orchestration (config loading, tool wiring, I/O) lives in `src/cli.ts`.
- `Agent` accepts an optional `AgentRenderer` (`src/util/agent-renderer.ts`). The core agent emits events (step start, thinking/response chunks, tool calls/results); the renderer handles presentation. `TerminalAgentRenderer` provides the default CLI output, and `NoopRenderer` can be used for tests or silent execution.
- Conversation history is persisted under `~/.mini-agent-ts/history/{session-id}.json`. Start with `--resume <session-id>` to restore a previous session. Use `history.maxHistoryTokens` in `config.yaml` to limit context length; older messages are summarized when the budget is exceeded.
- `BashTool` runs commands inside the workspace directory and enforces a security policy: destructive/system-wide commands are blocked, and sensitive commands like `rm`/`del`/`format` require explicit allowlisting or `tools.security.bash.allowDangerousCommands: true`.
- `ToolResult` supports a `retriable` flag. The Agent will automatically retry tools that fail with `retriable: true` according to `retry.maxRetries`. LLM stream failures are also retried automatically.
- `read_file` supports glob patterns (e.g. `src/**/*.ts`) for batch reads and automatically chunks large files when no line limit is provided.
- When adding a new built-in tool, implement the `Tool` interface in `src/tools/`, re-export it from `src/tools/index.ts`, and instantiate it in `src/cli.ts`.
- When adding a new LLM provider, extend `LLMClientBase` in `src/llm-client/` and add the provider enum/case in `src/llm-client/llm-client.ts` and `src/schema/schema.ts`.
- Skills are loaded recursively from `SKILL.md` files. The `SkillLoader` parses YAML frontmatter and validates it against `SkillSchema` in `src/skills/types.ts`.
- MCP SDK classes are loaded dynamically in `src/tools/mcp/utils.ts` to tolerate different package export layouts across versions.
