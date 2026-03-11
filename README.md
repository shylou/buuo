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
- ✅ **Session Management**: Context retention for continuous conversations
- ✅ **Stream Responses**: Real-time AI response delivery
- ✅ **Timeout Protection**: Request timeout detection (default 5 minutes)
- ✅ **Health Check**: Automatic recovery from process exceptions
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
cd /root/opendev/buuo
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

## ⚙️ Configuration

Configuration file: `config/default.config.yaml`

```yaml
# Claude Code Provider
providers:
  claude-code-provider:
    - id: claude-code-local
      enabled: true
      workingDirectory: /root/opendev/buuo
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
./scripts/start-gateway.sh logs

# Check Claude Code CLI
claude --version

# Check environment variables
cat .env
```

### No Response from Feishu

```bash
# Check WebSocket connection
# Look for "Lark WebSocket connection" in logs

# Verify Feishu app configuration
# - Event subscription enabled
# - Long connection mode enabled
```

### Claude Code Timeout

```bash
# Increase request timeout
# Edit config/default.config.yaml
# requestTimeout: 600000  # 10 minutes
```

## 📄 License

MIT License - See [LICENSE](LICENSE)

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

**Need help?** Submit an [Issue](https://github.com/shylou/buuo/issues)
