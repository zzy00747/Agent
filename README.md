<div align="center">
  <img src="mini-agent-logo.jpg" alt="mini-agent-ts" width="500">
  <h1>mini-agent-ts: A minimum terminal LLM Agent</h1>
  <p>
    <img src="https://img.shields.io/github/last-commit/Code-MonkeyZhang/mini-agent-ts?color=ff69b4" alt="last commit">
    <img src="https://img.shields.io/badge/language-TypeScript-blue" alt="TypeScript">
    <img src="https://img.shields.io/badge/node-≥18-blue" alt="Node.js">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  </p>
</div>

> This project is a TypeScript implementation of MiniMax's open-source [Mini-Agent](https://github.com/MiniMax-AI/Mini-Agent) project.

**mini-agent-ts** is a minimal and powerful terminal AI Agent with **~2,000** lines of core code. It supports **Agent Skills**, **MCP**, and multiple LLM providers (OpenAI/Anthropic compatible). Built with native file operations and command execution tools, it's perfect for developers who want to learn Agent implementation or build their own AI assistant.

---

## ✨ Key Features

- 🔄 **ReAct Mode**: Multi-step reasoning and tool calling for complex tasks
- 🧠 **Interleaved Chain of Thought**: Tightly integrates reasoning with tool execution
- 🔌 **MCP Protocol**: Connect to external tool ecosystems seamlessly
- 🛠️ **Agent Skills**: Customize domain expertise through knowledge bases
- 🌐 **Multi-Provider**: OpenAI, Anthropic, MiniMax, DeepSeek, and any OpenAI-compatible API

---

## 📦 Installation

```bash
# Clone repository
git clone https://github.com/Code-MonkeyZhang/mini-agent-ts.git
cd mini-agent-ts

# Install dependencies
npm install

# Build and link
npm run build && npm link
```

---

## 🚀 Quick Start

**1. Copy configuration**

```bash
cp config/config-example.yaml config/config.yaml
```

**2. Configure** (`config/config.yaml`)

_Set your API key and endpoint_:

```yaml
apiKey: 'your-api-key-here'
apiBase: 'https://api.minimaxi.com/v1/' # or your provider's endpoint

# Model and provider
model: 'MiniMax-M2.1'
provider: 'openai' # openai or anthropic
```

**3. Run**

```bash
mini-agent-ts
```

That's it! You have a working AI Agent in your terminal.

### 💾 Session Persistence

Conversation history is automatically saved to `~/.mini-agent-ts/history/{session-id}.json`. The session ID is printed when you start the agent.

To resume a previous session:

```bash
mini-agent-ts --resume <session-id>
```

You can also limit the history context length in `config/config.yaml`:

```yaml
history:
  autoSave: true
  maxHistoryTokens: 8000 # 0 = unlimited
```

When the token budget is exceeded, older messages are summarized to stay within the limit.

---

## 🔧 Configuration

### Environment Variables

All YAML config options can be overridden via environment variables. Env vars take precedence over `config.yaml`.

Prefix with `MINI_AGENT_` and use double underscores for nested keys:

```bash
export MINI_AGENT_API_KEY=sk-your-key
export MINI_AGENT_MODEL=MiniMax-M2.5
export MINI_AGENT_PROVIDER=openai
export MINI_AGENT_RETRY__ENABLED=false
export MINI_AGENT_HISTORY__MAX_HISTORY_TOKENS=8000
```

Common variables:

| Variable                          | Description                       | Default  |
| --------------------------------- | --------------------------------- | -------- |
| `MINI_AGENT_API_KEY`              | Your LLM provider API key         | Required |
| `MINI_AGENT_API_BASE`             | API endpoint URL                  | Required |
| `MINI_AGENT_MODEL`                | Model name                        | Required |
| `MINI_AGENT_PROVIDER`             | SDK type: `openai` or `anthropic` | `openai` |
| `MINI_AGENT_ENABLE_LOGGING`       | Enable runtime logging            | `false`  |
| `MINI_AGENT_VERBOSE`              | Enable verbose console output     | `false`  |
| `MINI_AGENT_MAX_STEPS`            | Maximum execution steps           | `50`     |
| `MINI_AGENT_RETRY__ENABLED`       | Enable retry mechanism            | `true`   |
| `MINI_AGENT_RETRY__MAX_RETRIES`   | Maximum number of retries         | `3`      |
| `MINI_AGENT_HISTORY__AUTO_SAVE`   | Auto-save conversation history    | `true`   |
| `MINI_AGENT_HISTORY__MAX_HISTORY_TOKENS` | History token budget         | `0`      |
| `MINI_AGENT_TOOLS__MCP__HEARTBEAT_INTERVAL` | MCP heartbeat interval (seconds) | `30.0` |
| `MINI_AGENT_TOOLS__MCP__MAX_RECONNECT_ATTEMPTS` | MCP reconnect attempts | `3` |
| `MINI_AGENT_TOOLS__MCP__RECONNECT_DELAY` | MCP reconnect delay (milliseconds) | `1000` |
| `MINI_AGENT_TOOLS__MAX_TOOL_RESULT_TOKENS` | Truncate tool results to this token budget | `8000` |

Configuration loading priority (highest to lowest):

1. Environment variables (`MINI_AGENT_*`)
2. `~/.mini-agent-ts/config/config.yaml`
3. `./config/config.yaml`
4. Built-in defaults

### Tool Security

Bash commands run inside the workspace directory by default. Destructive or system-wide commands (e.g. `rm -rf /`, `format C:`, `dd` to devices) are blocked. Sensitive commands like `rm`, `del`, `format`, `mkfs`, and `dd` are also blocked unless explicitly allowed:

```yaml
tools:
  security:
    bash:
      blockedPatterns: [] # Additional regex patterns to block
      allowedPatterns: [] # Patterns that bypass the blocklist
      allowDangerousCommands: false # Set true to allow sensitive commands
```

### Batch File Reading

`read_file` supports glob patterns for reading multiple files at once:

```text
read_file(glob="src/**/*.ts")
```

Large files are automatically chunked to ~8000 tokens when no `limit` is specified.

### Retry and Diagnostics

The agent automatically retries transient failures:

- **Tool retries**: Tools can mark failures as `retriable` (e.g. command timeouts). The agent retries them up to `retry.maxRetries` times.
- **LLM stream retries**: If the LLM stream is interrupted, the request is retried from the same messages.
- **Connection diagnostics**: On startup, the agent checks the API connection and reports specific failure reasons (missing API key, authentication error, network error, model not found, etc.).

Configure retry behavior:

```yaml
retry:
  enabled: true
  maxRetries: 3
```

### Performance and Context Management

- **Token-based truncation**: Tool results are truncated by token count (not hard-coded characters) before being sent to the LLM. Configure the budget with `tools.maxToolResultTokens`.
- **Context budgets**: Before every LLM call, the agent enforces `history.maxHistoryTokens` by compressing older non-system messages. Large tool results live outside the system prompt and are subject to truncation and history compression.
- **Concurrent tool calls**: When the LLM requests multiple tools in one step, the agent runs them in parallel and preserves their declaration order in the conversation history.

```yaml
tools:
  maxToolResultTokens: 8000 # Truncate oversized tool results to this many tokens

history:
  autoSave: true
  maxHistoryTokens: 8000 # 0 = unlimited
```

### Observability

- **Verbose mode**: Run with `--verbose` or set `verbose: true` / `MINI_AGENT_VERBOSE=true` to print detailed logs and stats to the console.
- **Per-step timing**: Each ReAct step reports LLM, tool, and total duration.
- **Token usage**: When the provider returns usage metadata, the agent reports prompt / completion / total tokens per step.

```bash
mini-agent-ts --verbose
```

```yaml
enableLogging: true # Write structured logs to project-root/logs/
verbose: true       # Also mirror logs to the console
```

### MCP Connection Management

MCP server connections are actively managed for reliability:

- **Heartbeat keepalive**: The client periodically pings connected MCP servers. If a heartbeat fails, an automatic reconnect is triggered.
- **Auto-reconnect**: When a tool call fails due to a connection error, or when the server is detected as disconnected, the client attempts to reconnect up to `maxReconnectAttempts` times with `reconnectDelay` between attempts.
- **Process exit cleanup**: On `exit`, `SIGINT`, or `SIGTERM`, all MCP connections are closed gracefully to avoid orphaned child processes.

Configure connection behavior under `tools.mcp` in `config/config.yaml`:

```yaml
tools:
  mcp:
    connectTimeout: 10.0
    executeTimeout: 60.0
    sseReadTimeout: 120.0
    heartbeatInterval: 30.0 # seconds, 0 to disable
    maxReconnectAttempts: 3
    reconnectDelay: 1000 # milliseconds
```

Or under the top-level `mcp` key in `config/mcp.json`:

```json
{
  "mcp": {
    "heartbeatInterval": 30.0,
    "maxReconnectAttempts": 3,
    "reconnectDelay": 1000
  },
  "mcpServers": { ... }
}
```

### MCP Servers

Add external tools via MCP protocol:

```bash
cp config/mcp-example.json config/mcp.json
```

Edit `config/mcp.json`:

```json
{
  "mcpServers": {
    "time-server": {
      "command": "uvx",
      "args": ["mcp-server-time"],
      "description": "Provides current time query"
    }
  }
}
```

### Agent Skills

Add custom skills to extend Agent capabilities:

```yaml
tools:
  skillsDir: './skills'
```

Create skill files in `skills/` directory following the [Agent Skills](https://agentskills.io) format.

---

## 📖 Project Structure

```
mini-agent-ts/
├── src/
│   ├── agent.ts        # Core agent loop (ReAct)
│   ├── cli.ts          # CLI entry point
│   ├── config.ts       # Configuration loader
│   ├── llm-client/     # LLM provider adapters
│   ├── schema/         # Data models
│   ├── skills/         # Skills loader
│   └── tools/          # Built-in tools
├── config/
│   ├── config.yaml     # Main config
│   └── mcp.json        # MCP servers
├── skills/             # User skills
└── tests/              # Tests
```

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📚 Reference

- [OpenAI API](https://platform.openai.com/docs/api-reference/chat)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Agent Skills](https://agentskills.io)

---

### Made with ❤️ by [Code-MonkeyZhang](https://github.com/Code-MonkeyZhang)
