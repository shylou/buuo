/**
 * Plugin Interface - Defines the contract for all plugins
 * @module plugins
 */

import type { Gateway } from '../gateway/index.js';
import type { ConfigStore } from '../config/index.js';
import type { Logger } from '../utils/logger.js';
import type { EventEmitter } from 'eventemitter3';

export type PluginType = 'channel' | 'provider' | 'skill' | 'auth';

export interface Plugin {
  /** Plugin ID */
  id: string;

  /** Plugin name */
  name: string;

  /** Plugin version */
  version: string;

  /** Plugin description */
  description: string;

  /** Plugin type */
  type: PluginType;

  /** Plugin author */
  author?: string;

  /**
   * Initialize the plugin with context
   */
  initialize(context: PluginContext): Promise<void>;

  /**
   * Start the plugin
   */
  start(): Promise<void>;

  /**
   * Stop the plugin
   */
  stop(): Promise<void>;

  /**
   * Get plugin configuration schema
   */
  getConfigSchema?(): JSONSchema;

  /**
   * Validate plugin configuration
   */
  validateConfig?(config: unknown): ValidationResult;
}

export interface PluginContext {
  /** Core gateway instance */
  gateway: Gateway;

  /** Configuration store */
  config: ConfigStore;

  /** Logger */
  logger: Logger;

  /** Event bus */
  events: EventEmitter;

  /** Plugin data directory */
  dataDir: string;
}

export interface ChannelPlugin extends Plugin {
  type: 'channel';

  /** Create channel instance */
  createChannel(config: ChannelPluginConfig): import('../channels/index.js').Channel;
}

export interface ProviderPlugin extends Plugin {
  type: 'provider';

  /** Create provider instance */
  createProvider(config: ProviderPluginConfig): import('../providers/index.js').AIProvider;
}

export interface SkillPlugin extends Plugin {
  type: 'skill';

  /** Skill definitions */
  skills: SkillDefinition[];

  /** Execute skill */
  executeSkill(skillId: string, input: unknown): Promise<unknown>;
}

export interface AuthPlugin extends Plugin {
  type: 'auth';

  /** Authenticate user */
  authenticate(userId: string, credentials: unknown): Promise<PluginAuthResult>;

  /** Authorize action */
  authorize(userId: string, action: string, resource: string): Promise<boolean>;

  /** Get user info */
  getUserInfo(userId: string): Promise<PluginUserInfo | null>;
}

export interface ChannelPluginConfig {
  token?: string;
  webhookUrl?: string;
  options?: Record<string, unknown>;
}

export interface ProviderPluginConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  options?: Record<string, unknown>;
}

export interface SkillDefinition {
  /** Skill ID */
  id: string;

  /** Skill name */
  name: string;

  /** Skill description */
  description: string;

  /** Input schema */
  inputSchema: JSONSchema;

  /** Output schema */
  outputSchema?: JSONSchema;

  /** Skill handler */
  handler: (input: unknown, context: SkillContext) => Promise<unknown>;
}

export interface SkillContext {
  /** User ID */
  userId: string;

  /** Conversation ID */
  conversationId: string;

  /** Channel ID */
  channelId: string;

  /** Session data */
  session: Record<string, unknown>;
}

export interface PluginAuthResult {
  /** Is authenticated */
  authenticated: boolean;

  /** Access token */
  token?: string;

  /** Permissions */
  permissions?: string[];

  /** Error message */
  error?: string;
}

export interface PluginUserInfo {
  /** User ID */
  id: string;

  /** User name */
  name: string;

  /** User email */
  email?: string;

  /** User roles */
  roles: string[];

  /** User metadata */
  metadata?: Record<string, unknown>;
}

export interface JSONSchema {
  /** Schema type */
  type: string;

  /** Schema title */
  title?: string;

  /** Schema description */
  description?: string;

  /** Required properties */
  required?: string[];

  /** Properties */
  properties?: Record<string, JSONSchema>;

  /** Array items schema */
  items?: JSONSchema;

  /** Enum values */
  enum?: unknown[];

  /** Additional schema properties */
  [key: string]: unknown;
}

export interface ValidationResult {
  /** Is valid */
  valid: boolean;

  /** Validation errors */
  errors?: ValidationError[];
}

export interface ValidationError {
  /** Error path */
  path: string;

  /** Error message */
  message: string;

  /** Invalid value */
  value: unknown;
}
