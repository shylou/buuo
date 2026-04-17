# Changelog

All notable changes to Buuo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.1] - 2026-04-17

### Added
- **Codex CLI Provider** for local Codex integration via `codex exec --json`
- **Built-in Codex plugin registration** in the CLI gateway
- **Provider-aware `/model` behavior**
  - Claude providers continue to use aliases: `default`, `haiku`, `sonnet`, `opus`
  - Codex provider accepts raw model strings such as `gpt-5.4` and `gpt-5.4-mini`
- **Gateway runtime status command** with PID-based running/stale state detection
- **Single-instance gateway tests** and Codex routing / integration regression coverage

### Changed
- **Default provider request timeout increased** from 5 minutes to 10 minutes
- **README and provider docs updated** for Codex support, provider switching, and provider-aware model usage
- **Gateway routing logs improved** to always record the resolved provider and model values

### Fixed
- **Gateway shutdown cleanup** now cleans provider-owned timers and subprocesses
- **PID file handling** now prevents stale PID deletion races and multiple active gateway instances
- **Startup script reliability** now fails fast on build errors instead of silently starting stale artifacts
- **Lark WebSocket transport stability** improved with explicit SDK HTTP handling

## [2.0.1] - 2026-03-17

### Breaking Changes
- **Agent SDK Provider is now the default provider** (previously CLI provider)
- **MCP configuration via `.mcp.json`** - MCP servers must be configured in `.mcp.json` file in buuo directory

### Added
- **Automatic MCP server loading** from `.mcp.json` using `settingSources: ['user', 'project']`
- **`.mcp.json.example` template** - Example configuration for MCP servers with documentation
- **Enhanced MCP tool access control** - Individual MCP tools can be allowed via `allowedTools` (e.g., `mcp__context7__*`)

### Migration Guide

**From v1.x to v2.0.1:**

1. **Create `.mcp.json` from template:**
   ```bash
   cp .mcp.json.example .mcp.json
   # Edit .mcp.json with your API keys
   ```

2. **Verify MCP tools:**
   - MCP tools follow naming pattern: `mcp__<server-name>__<tool-name>`
   - Add to `allowedTools`: `mcp__context7__*`, `mcp__jira__*`, etc.

## [Unreleased]

### Added
- **Agent SDK Provider** as alternative to CLI provider
  - Uses Anthropic Agent SDK for simpler, more direct integration
  - Native streaming API with automatic agent loop handling
  - Session persistence managed by SDK
  - Supports `claude_code` preset for full tool access
  - Requires `ANTHROPIC_API_KEY` environment variable
- **Provider type selection** via `providerType` configuration (`cli` or `agent-sdk`)
- **allowedTools configuration** for Claude Code provider to control tool access
  - Support for whitelisting specific tools (Read, Write, Edit, Grep, Glob, etc.)
  - Support for Bash patterns (e.g., `Bash(python3:*)` for skills, `Bash(git:*)` for git)
  - Support for MCP tools (Jira, Context7, Sequential-thinking, Magic, etc.)
  - Tools passed via `--allowed-tools` flag with `--permission-mode auto`
- **/model command** to switch AI models per session (default, haiku, sonnet, opus)
- **/cancel command** to terminate active AI requests
- Initial release of Buuo AI Assistant System
- Local Claude Code CLI integration with tool access
- Feishu/Lark channel with WebSocket long connection (no public IP required)
- Session management with context awareness
- Stream-based AI responses with real-time delivery
- Configurable timeouts and session handling
- Markdown card support for rich text rendering
- LRU cache for automatic memory management
- Session expiry mechanism with periodic cleanup (24h TTL, 5min cleanup interval)
- Per-conversation locking to prevent concurrent processing race conditions
- **Auto-create working directory** if not found (recursive mkdir with logging)

### Changed
- Extracted magic numbers to named constants for better maintainability
- Optimized SessionManager.listActive() from O(n) to O(m) using activeSessionIds Set
- Replaced `as any` type assertions with proper TypeScript interfaces
- Enhanced error handling with try-finally pattern for timer cleanup
- Updated README with accurate configuration examples and default values
- Clarified session history default (100 messages) vs config example (50 messages)
- Set default workingDirectory to `/root/opendev` in configuration

### Fixed
- **Stdout buffer handling** - process remaining content on stream end to prevent response loss
- Timer leak in gateway message handling (immediateUpdateTimer now properly cleaned up)
- Session ID memory leak (unbounded cache now has 24h TTL with automatic cleanup)
- Conversation channel unbounded growth (LRU cache with 1000 entry limit)
- Lark message ID cache unbounded growth (LRU cache with 1000 entry limit)
- Concurrent message processing race condition (per-conversation locks)
- Configuration documentation to match actual code defaults (maxHistory, temperature, etc.)

### Channels
- **Lark/Feishu** - WebSocket mode, no public IP required

### Providers
- **Claude Code CLI** - Local installation with full tool access

### Documentation
- User guide for Lark/Feishu setup
- API reference for channels, providers, and plugins
- Configuration examples

### Development
- Plugin architecture for extensibility
- TypeScript with strict type checking
- Comprehensive error handling and logging

---

## Versioning Scheme

- **Major** (X.0.0): Breaking changes, major features
- **Minor** (0.X.0): New features, backward compatible
- **Patch** (0.0.X): Bug fixes, small improvements

---

## Release Template

```markdown
## [0.1.0] - 2026-03-09

### Added
- New feature description

### Changed
- Modified feature description

### Fixed
- Bug fix description

### Removed
- Deprecated feature description

### Security
- Security fix description
```

---

## Links

- [GitHub Repository](https://github.com/shylou/buuo)
