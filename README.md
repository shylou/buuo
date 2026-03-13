# Buuo - Claude Code Local Integration Assistant

🦐 Personal AI assistant system connecting Feishu/Lark with local Claude Code CLI

```
Feishu User ←→ Buuo Gateway ←→ Claude Code CLI (Local)
                     ↓
          Session Management + Timeout Detection + Error Handling
```

> **🤖 AI-Generated Project**: This project is predominantly AI-generated with minimal human intervention. We encourage interested developers to explore AI-driven development to enhance its functionality and add new features. The codebase leverages AI agents for architecture design, implementation, documentation, and optimization.

## ✨ Key Features

- ✅ **Claude Code Local Integration**: Direct integration with local Claude Code CLI
- ✅ **Feishu Long Connection**: WebSocket persistent connection, no public IP required
- ✅ **Session Management**: Context retention for continuous conversations (max 100 messages)
- ✅ **Stream Responses**: Real-time AI response delivery
- ✅ **Resume Mode**: Uses Claude Code `--resume` for 90%+ token savings
- ✅ **Timeout Protection**: Request timeout detection (default 5 minutes)
- ✅ **Memory Management**: LRU caches prevent unbounded growth
- ✅ **Concurrency Safety**: Per-conversation locks prevent race conditions
- ✅ **Tool Access**: Full support for Claude Code tool calling

## 📦 Prerequisites

```bash
# 1. Install Node.js >= 22.0.0
node --version

# 2. Install pnpm
npm install -g pnpm

# 3. Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 4. Prepare Feishu/Lark App
# - Create Feishu app, get App ID and App Secret
# - Enable event subscription (long connection mode)
```

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

## 💬 Chat Commands

Buuo supports the following commands in Feishu/Lark:

| Command | Description |
|---------|-------------|
| `/model` | Show current model and available models |
| `/model <alias>` | Switch AI model for current session |
| `/cancel` | Cancel the active AI request |

**Available Models:**
- `default` - Default model (Sonnet 4.6)
- `haiku` - Fast and cost-effective (Haiku 4)
- `sonnet` - Balanced performance (Sonnet 4.6)
- `opus` - Highest capability (Opus 4.6)

Model settings are per-session, meaning different conversations can use different models.

## ⚙️ Configuration

Configuration file: `config/default.config.yaml`

```yaml
# Gateway Configuration
gateway:
  id: main_gateway

# Session Configuration
session:
  maxHistory: 50              # Maximum messages per session (default: 100 if not specified)

# Router Configuration
router:
  defaultProvider: claude-code
  systemPrompt: |
    You are a helpful AI assistant answering questions in Chinese.
  maxTokens: 4096

# Claude Code Provider
providers:
  claude-code-provider:
    - id: claude-code
      enabled: true
      workingDirectory: /root/opendev    # Auto-created if not exists
      enableTools: true
      requestTimeout: 300000     # Request timeout (5 minutes)

# Feishu/Lark Channel
channels:
  lark-channel:
    - token: ${LARK_APP_ID}
      enabled: true
      options:
        appSecret: ${LARK_APP_SECRET}
```

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
                                     Claude Code Provider
                                              ↓
                                  (Resume Mode - 90%+ Token Savings)
                                              ↓
                                         Response Stream
                                              ↓
                                     Lark Channel
                                              ↓
                                         Feishu User
```

### Key Design Decisions

- **Resume Mode**: Uses Claude Code's `--resume` functionality for efficient context management
  - First request: Creates new session with `--session-id`
  - Subsequent requests: Uses `--resume` with cached session ID
  - Claude Code manages disk-based history automatically
  - Only sends current message (90%+ token savings)

- **Memory Management**: LRU caches prevent unbounded growth
  - Message ID cache: 1000 entries, auto-evicts oldest
  - Conversation channel: 1000 entries, auto-evicts oldest
  - Session expiry: 24h TTL with 5min cleanup interval

- **Concurrency Safety**: Per-conversation locks prevent race conditions
  - Each conversation has its own processing lock
  - Concurrent messages for same conversation are serialized
  - Prevents session corruption and duplicate responses

- **Error Resilience**: Comprehensive error handling and cleanup
  - Timer cleanup with try-finally pattern
  - Process cleanup on timeout/error
  - Automatic session expiry and cleanup
  - Auto-create working directory if not found

## 📁 Project Structure

```
buuo/
├── packages/
│   ├── core/                    # Core gateway and interfaces
│   ├── channel-lark/            # Feishu/Lark integration
│   ├── provider-claude-code/    # Claude Code CLI integration
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
