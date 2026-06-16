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

| Variable        | Description                       | Default  |
| --------------- | --------------------------------- | -------- |
| `apiKey`        | Your LLM provider API key         | Required |
| `apiBase`       | API endpoint URL                  | Required |
| `model`         | Model name                        | Required |
| `provider`      | SDK type: `openai` or `anthropic` | `openai` |
| `enableLogging` | Enable runtime logging            | `false`  |

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
