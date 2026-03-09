/**
 * @buuo/plugin-sdk - Plugin SDK for Buuo
 *
 * This package provides utilities and helpers for creating Buuo plugins.
 */

// Channel plugin SDK
export * from './channel.js';

// Provider plugin SDK
export * from './provider.js';

// Skill plugin SDK
export * from './skill.js';

// Re-export core types for convenience
export type {
  Channel,
  ChannelConfig,
  IncomingMessage,
  OutgoingMessage,
  MessageHandler,
  ChannelStatus
} from '@buuo/core/channels';

export type {
  AIProvider,
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  TokenUsage,
  ToolDefinition,
  ToolCall
} from '@buuo/core/providers';

export type {
  Plugin,
  PluginContext,
  ChannelPlugin,
  ProviderPlugin,
  SkillPlugin,
  AuthPlugin,
  SkillDefinition,
  SkillContext,
  JSONSchema
} from '@buuo/core/plugins';
