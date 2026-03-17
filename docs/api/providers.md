# Provider API Documentation

Buuo provider system supports multiple AI backends with unified conversational interface.

---

## Available Providers

### 1. CLI Provider (`claude-code`)

Uses local Claude Code CLI installation.

**Features:**
- Resume Mode: Uses `--resume` for 90%+ token savings
- Disk-based session management (CLI managed)
- Full Claude Code tool access
- No API key required

**Configuration:**
```yaml
- id: claude-code
  enabled: true
  providerType: cli
  workingDirectory: /path/to/workspace
  enableTools: true
  requestTimeout: 300000
  allowedTools:
    - Read
    - Write
    - Edit
    - Grep
    - Glob
    - Bash(python3:*)
    - Bash(git:*)
    - mcp__*
```

### 2. Agent SDK Provider (`agent-sdk`) - Default

Uses Anthropic Agent SDK for direct API integration.

**Features:**
- Native streaming API
- Automatic agent loop handling
- SDK-managed session persistence
- Built-in MCP server support via `.mcp.json`
- Requires `ANTHROPIC_API_KEY`

**Configuration:**
```yaml
- id: agent-sdk
  enabled: true
  providerType: agent-sdk
  model: default  # or 'haiku', 'sonnet', 'opus'
  workingDirectory: /path/to/workspace
  requestTimeout: 300000
  enableFileCheckpointing: false
  allowedTools:
    - Read
    - Write
    - Edit
    - Grep
    - Glob
    - Bash
    - mcp__context7__*
    - mcp__jira__*
```

**MCP Configuration:**
Create `.mcp.json` in buuo directory:
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
        "JIRA_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## Provider Configuration Reference

### Common Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | required | Unique provider identifier |
| `enabled` | boolean | true | Whether provider is active |
| `providerType` | string | required | `cli` or `agent-sdk` |
| `workingDirectory` | string | `process.cwd()` | Task execution directory |
| `requestTimeout` | number | 300000 | Request timeout in milliseconds |
| `allowedTools` | string[] | undefined | Tool whitelist |

### Agent SDK Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `default` | Model: `default`, `haiku`, `sonnet`, `opus` |
| `enableFileCheckpointing` | boolean | false | Enable file checkpoint feature |

### CLI Provider Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableTools` | boolean | true | Enable Claude Code tool access |

---

## Tool Access Control

### Tool Naming Patterns

| Pattern | Description |
|---------|-------------|
| `Read`, `Write`, `Edit` | File operations |
| `Grep`, `Glob` | Search operations |
| `Bash` | Command execution |
| `Bash(python3:*)` | Python scripts (pattern) |
| `Bash(git:*)` | Git operations (pattern) |
| `mcp__<server>__*` | All tools from MCP server |
| `mcp__context7__query` | Specific MCP tool |

### MCP Tool Reference

| MCP Tool | Description |
|----------|-------------|
| `mcp__context7__*` | Official library documentation |
| `mcp__jira__*` | Jira issue tracking |
| `mcp__sequential-thinking__*` | Multi-step reasoning |
| `mcp__magic__*` | UI component generation |
| `mcp__web_reader__*` | Web content fetching |
| `mcp__4_5v_mcp__*` | Image analysis |
| `mcp__zai-mcp-server__*` | Image/video analysis |
| `mcp__zread__*` | GitHub repository access |

---

## Switching Providers

### Enable CLI Provider
```yaml
router:
  defaultProvider: claude-code

providers:
  claude-code-provider:
    - id: claude-code
      enabled: true
      providerType: cli
    - id: agent-sdk
      enabled: false
```

### Enable Agent SDK Provider (Default)
```yaml
router:
  defaultProvider: agent-sdk

providers:
  claude-code-provider:
    - id: claude-code
      enabled: false
    - id: agent-sdk
      enabled: true
      providerType: agent-sdk
```

---

## Related Documentation

- [Channels API](./channels.md)
- [Plugins API](./plugins.md)
- [README](../README.md)
