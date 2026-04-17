# Buuo - Local AI Coding Assistant Gateway

🦐 Personal AI assistant system connecting Feishu/Lark with local coding agents such as Claude Code and Codex

```
Feishu User ←→ Buuo Gateway ←→ Local AI Provider
                     ↓
          Session Management + Timeout Detection + Error Handling
```

> **🤖 AI-Generated Project**: This project is predominantly AI-generated with minimal human intervention. We encourage interested developers to explore AI-driven development to enhance its functionality and add new features. The codebase leverages AI agents for architecture design, implementation, documentation, and optimization.

## ✨ Key Features

- ✅ **Multiple Provider Support**: Claude Code CLI, Claude Agent SDK, and Codex CLI
- ✅ **MCP Server Support**: Extend capabilities with external tools
- ✅ **Feishu Integration**: WebSocket long connection, no public IP required
- ✅ **Session Management**: Context retention with automatic cleanup
- ✅ **Real-time Streaming**: Fast response delivery
- ✅ **Tool Access Control**: Fine-grained permission management

## 📊 Provider Comparison

| Provider | Transport | Session Mode | Use When |
|:---------|:----------|:-------------|:---------|
| Claude Code CLI | Local CLI | Resume mode | You want Claude Code tooling with local CLI state |
| Claude Agent SDK | Native SDK | SDK-managed persistence | You want direct Anthropic API integration |
| Codex CLI | Local CLI | Resume mode | You want Feishu messages bridged into local Codex CLI |

## 📦 Prerequisites

```bash
# 1. Install Node.js >= 22.0.0
node --version

# 2. Install pnpm
npm install -g pnpm

# 3. Prepare Feishu/Lark App
# - Create Feishu app, get App ID and App Secret
# - Enable event subscription (long connection mode)

# Optional: For Claude CLI Provider
# npm install -g @anthropic-ai/claude-code

# Optional: For Codex CLI Provider
# install Codex CLI and run `codex login`
```

> **💡 Provider Choice**
>
> - **Agent SDK Provider** (current default): Requires provider-specific API configuration
> - **Codex CLI Provider** (optional): Requires local `codex`, completed `codex login`, and host network access to Codex
> - **Claude Code CLI Provider** (optional): Requires local Claude Code CLI installation
## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd /path/to/buuo
pnpm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# Feishu/Lark App Configuration (Required)
LARK_APP_ID=cli_xxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxx

# Claude Code CLI (Optional, defaults to system-installed claude)
# CLAUDE_CLI_PATH=/custom/path/to/claude
```

### 3. Build Project

```bash
pnpm build
```

### 4. Start Gateway

```bash
# Using script (Recommended)
./scripts/start-gateway.sh start

# Check status
./scripts/start-gateway.sh status

# View logs
./scripts/start-gateway.sh logs

# Stop gateway
./scripts/start-gateway.sh stop
```

### 5. Verify Operation

Successful startup shows:

```
🦐 Buuo Gateway starting...
✓ Lark WebSocket connection established
✓ Gateway started successfully
────────────────────────────────────────
  Channels: 1/1 connected
  Providers: 1/1 available
────────────────────────────────────────
```

### 6. Configure MCP Servers (Optional)

MCP (Model Context Protocol) servers extend Claude's capabilities with external tools.

**Step 1: Create .mcp.json from template**
```bash
cp .mcp.json.example .mcp.json
```

**Step 2: Edit .mcp.json with your API keys**
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "jira": {
      "command": "npx",
      "args": ["-y", "jira-mcp"],
      "env": {
        "JIRA_INSTANCE_URL": "https://your-domain.atlassian.net",
        "JIRA_API_KEY": "your-api-key",
        "JIRA_USER_EMAIL": "your-email@example.com"
      }
    }
  }
}
```

**Step 3: Restart gateway**
```bash
./scripts/start-gateway.sh restart
```

**Available MCP Servers:** See `.mcp.json.example` for full list including Context7, Jira, Sequential-thinking, Magic, and more.

## 💬 Chat Commands

Buuo supports the following commands in Feishu/Lark:

| Command | Description |
|---------|-------------|
| `/model` | Show current model and available models |
| `/model <value>` | Switch AI model for current session |
| `/cancel` | Cancel the active AI request |

**Claude session models:**
- `default` - Default model (Sonnet 4.6)
- `haiku` - Fast and cost-effective (Haiku 4)
- `sonnet` - Balanced performance (Sonnet 4.6)
- `opus` - Highest capability (Opus 4.6)

**Codex session models:**
- `/model gpt-5.4`
- `/model gpt-5.4-mini`
- any other raw Codex model string supported by your local Codex CLI

Model settings are per-session. Claude-family providers use aliases; Codex uses raw model strings.

## 🛡️ Tool Access Control

Buuo supports fine-grained tool access control through the `allowedTools` configuration. This allows you to restrict which tools Claude Code can use.

### Example Configurations

**Conservative (Read-only):** `Read`, `Grep`, `Glob`, `AskUserQuestion`

**Standard (File operations):** `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash`, `AskUserQuestion`

**Full (All tools including MCP):** All tools above plus `mcp__context7__*`, `mcp__jira__*`, `mcp__sequential-thinking__*`, `mcp__magic__*`, etc.

### MCP Tool Reference

| MCP Tool | Purpose |
|----------|---------|
| `mcp__context7__*` | Official library documentation lookup |
| `mcp__jira__*` | Jira issue tracking integration |
| `mcp__sequential-thinking__*` | Multi-step reasoning engine |
| `mcp__magic__*` | UI component generation (21st.dev) |
| `mcp__web_reader__*` | Web content fetching |
| `mcp__4_5v_mcp__*` | Image analysis |
| `mcp__zai-mcp-server__*` | Image/video analysis and more |
| `mcp__zread__*` | GitHub repository access |

## ⚙️ Configuration

Configuration file: `config/default.config.yaml`

```yaml
gateway:
  id: main_gateway

session:
  maxHistory: 50

router:
  defaultProvider: agent-sdk
  systemPrompt: |
    You are a helpful AI assistant answering questions in Chinese.
  maxTokens: 4096

providers:
  claude-code-provider:
    - id: agent-sdk
      enabled: true
      providerType: agent-sdk
      model: default
      workingDirectory: /root/opendev
      requestTimeout: 600000

    - id: claude-code
      enabled: false
      providerType: cli

  # Codex remains available as an alternative provider.
  codex-provider:
    - id: codex-cli
      enabled: false
      providerType: cli
      cliPath: codex
      workingDirectory: /root/opendev
      model: gpt-5.4
      requestTimeout: 600000
      fullAuto: true
      skipGitRepoCheck: false
      ephemeral: false
      configOverrides:
        - model_reasoning_effort="high"

channels:
  lark-channel:
    - token: ${LARK_APP_ID}
      enabled: true
      options:
        appSecret: ${LARK_APP_SECRET}
```

### Switching Providers

Edit `config/default.config.yaml`:

```yaml
router:
  defaultProvider: agent-sdk  # or 'claude-code' / 'codex-cli'
```

Restart: `./scripts/start-gateway.sh restart`

## 🔧 Development

```bash
# Development mode
pnpm dev

# Type checking
pnpm typecheck

# Code linting
pnpm check
```

## 🏗️ Architecture

### Message Flow

```
Feishu Message → Lark Channel → Gateway → Session Manager
                                              ↓
                                         Message Router
                                              ↓
                                     Agent SDK Provider (default)
                                              ↓
                                  (Native streaming with MCP support)
                                              ↓
                                         Response Stream
                                              ↓
                                     Lark Channel
                                              ↓
                                         Feishu User
```

**Alternative Providers:** Claude Code CLI and Codex CLI are also available.

### Key Design Decisions

- **Provider Abstraction**: Unified interface supporting multiple AI backends
  - Agent SDK Provider: Direct API integration with native streaming
  - CLI Provider: Local Claude Code CLI with resume mode

- **MCP Integration**: External tools via Model Context Protocol
  - Configure servers in `.mcp.json` (auto-loaded from buuo directory)
  - Tool access control via `allowedTools` (e.g., `mcp__context7__*`)

- **Memory Management**: Automatic cleanup prevents unbounded growth
  - Session expiry: 24h TTL with 5min cleanup interval
  - Per-session caching with automatic eviction

- **Concurrency Safety**: Per-conversation locks prevent race conditions
  - Each conversation has its own processing lock
  - Concurrent messages are serialized

- **Error Resilience**: Comprehensive error handling and cleanup
  - try-finally patterns for resource cleanup
  - Automatic session expiry and cleanup

## 📁 Project Structure

```
buuo/
├── packages/
│   ├── core/                    # Core gateway and interfaces
│   ├── channel-lark/            # Feishu/Lark integration
│   ├── provider-claude-code/    # Claude Code CLI + Agent SDK integration
│   ├── provider-codex/          # Codex CLI integration
│   └── plugin-sdk/              # Plugin development SDK
├── apps/
│   └── cli/                     # Command-line tools
├── config/                      # Configuration files
├── scripts/                     # Utility scripts
│   └── start-gateway.sh         # Gateway management script
└── README.md
```

## 🐛 Troubleshooting

### Gateway Won't Start

```bash
# Check logs
tail -50 /tmp/buuo_service.log

# Or use the script
./scripts/start-gateway.sh logs

# Check Claude Code CLI
claude --version

# Check configuration
npx tsx apps/cli/dist/cli.js config validate
```

### No Response from Feishu

```bash
# Check WebSocket connection in logs
tail -50 /tmp/buuo_service.log | grep -i "websocket\|lark"

# Verify environment variables
cat .env | grep LARK

# Check gateway status
./scripts/start-gateway.sh status
```

### Claude Code Timeout

```bash
# Current timeout is 5 minutes (300000ms)
# To increase, edit config/default.config.yaml:
# requestTimeout: 600000  # 10 minutes
```

## 📄 License

MIT License - See [LICENSE](LICENSE)

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

**Need help?** Submit an [Issue](https://github.com/shylou/buuo/issues)
