# Changelog

All notable changes to Buuo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
