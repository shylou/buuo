/**
 * Gateway - Main gateway class coordinating all components
 * @module gateway
 */

import { EventEmitter } from 'eventemitter3';
import type { Channel, IncomingMessage } from '../channels/interface.js';
import type { AIProvider, ChatResponse } from '../providers/interface.js';
import type { PluginManager } from '../plugins/manager.js';
import type { ConfigStore } from '../config/store.js';
import type { Logger } from '../utils/logger.js';
import { SessionManager, type SessionOptions } from './session.js';
import { MessageRouter, type RouterOptions } from './router.js';
import { MODEL_ALIASES, MODEL_DISPLAY_NAMES } from '../providers/model-config.js';

export interface GatewayConfig {
  /** Gateway ID */
  id?: string;

  /** Session options */
  session?: SessionOptions;

  /** Router options */
  router?: RouterOptions;

  /** Auto-start plugins */
  autoStartPlugins?: boolean;
}

export interface GatewayStatus {
  /** Gateway ID */
  id: string;

  /** Is gateway running */
  running: boolean;

  /** Channels status */
  channels: {
    total: number;
    connected: number;
    disconnected: number;
  };

  /** Providers status */
  providers: {
    total: number;
    available: number;
    unavailable: number;
  };

  /** Sessions status */
  sessions: {
    total: number;
    active: number;
    byUser: number;
  };

  /** Plugins status */
  plugins: {
    total: number;
    loaded: number;
    started: number;
  };

  /** Uptime in milliseconds */
  uptime?: number;
}

export class Gateway extends EventEmitter {
  private readonly id: string;
  private _running = false;
  private _startTime?: Date;
  private readonly channelConfigs = new Map<string, object>();
  private readonly providerConfigs = new Map<string, object>();

  /** Per-conversation locks to prevent concurrent processing */
  private readonly conversationLocks = new Map<string, Promise<void>>();

  /** /model command regex: matches /model or /model <alias> */
  private readonly MODEL_COMMAND_REGEX = /^\s*\/model\s*(\S*)\s*$/i;

  /** /cancel command regex: matches /cancel */
  private readonly CANCEL_COMMAND_REGEX = /^\s*\/cancel\s*$/i;

  /** Message templates */
  private readonly MESSAGES = {
    NO_ACTIVE_REQUEST: 'No active request to cancel.',
    NO_AVAILABLE_PROVIDER: 'No available AI provider.',
    PROVIDER_NOT_SUPPORTED: 'This AI provider does not support cancel.',
    REQUEST_CANCELLED: 'Request cancelled. Current request terminated, session context preserved.',
    THINKING_INDICATOR: (elapsed: string) => `🤔 **Thinking...** (${elapsed}s)`
  } as const;

  public readonly sessions: SessionManager;
  public readonly router: MessageRouter;

  constructor(
    private readonly config: GatewayConfig = {},
    public readonly plugins: PluginManager,
    public readonly configStore: ConfigStore,
    public readonly logger: Logger
  ) {
    super();

    this.id = config.id ?? `gateway_${Date.now()}`;
    this.sessions = new SessionManager(config.session, logger);
    this.router = new MessageRouter(config.router, logger);
  }

  get running(): boolean {
    return this._running;
  }

  get startTime(): Date | undefined {
    return this._startTime;
  }

  /**
   * Initialize the gateway
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing gateway: ${this.id}`);

    // Load plugins
    await this.plugins.loadAll();

    // Register channels and providers from plugins
    this.registerPluginComponents();

    // Initialize providers
    for (const provider of this.router.getProviders()) {
      const config = this.providerConfigs.get(provider.id);
      try {
        await provider.initialize(config || {});
        this.logger.info(`Provider initialized: ${provider.id}`);
      } catch (error) {
        this.logger.error(`Failed to initialize provider ${provider.id}: ${error}`);
      }
    }

    // Start plugins if configured
    if (this.config.autoStartPlugins ?? true) {
      await this.plugins.startAll();
    }

    this.logger.info('Gateway initialized');
    this.emit('initialized');
  }

  /**
   * Start the gateway
   */
  async start(): Promise<void> {
    if (this._running) {
      throw new Error('Gateway is already running');
    }

    this.logger.info('Starting gateway...');

    // Initialize and start all channels
    for (const channel of this.router.getChannels()) {
      try {
        // Get the stored config
        const config = this.channelConfigs.get(channel.id);

        // Initialize channel first
        await channel.initialize(config || {});
        this.logger.info(`Channel initialized: ${channel.id}`);

        // Then start it
        await channel.start();
        this.logger.info(`Channel started: ${channel.id}`);
      } catch (error) {
        this.logger.error(`Failed to start channel ${channel.id}: ${error}`);
      }
    }

    this._running = true;
    this._startTime = new Date();

    this.logger.info('Gateway started');
    this.emit('started');
  }

  /**
   * Stop the gateway
   */
  async stop(): Promise<void> {
    if (!this._running) {
      return;
    }

    this.logger.info('Stopping gateway...');

    // Stop all channels
    for (const channel of this.router.getChannels()) {
      try {
        await channel.stop();
        this.logger.info(`Channel stopped: ${channel.id}`);
      } catch (error) {
        this.logger.error(`Failed to stop channel ${channel.id}: ${error}`);
      }
    }

    // Stop plugins
    await this.plugins.stopAll();

    this._running = false;
    this.logger.info('Gateway stopped');
    this.emit('stopped');
  }

  /**
   * Handle incoming message (with per-conversation locking)
   */
  async handleMessage(message: IncomingMessage): Promise<void> {
    const conversationId = message.conversationId;

    // Check for /model command FIRST (before locking for immediate response)
    const modelMatch = message.content.match(this.MODEL_COMMAND_REGEX);
    if (modelMatch) {
      await this.handleModelCommand(message, modelMatch[1] || '');
      return;
    }

    // Check for /cancel command (before locking to allow cancellation)
    if (this.CANCEL_COMMAND_REGEX.test(message.content)) {
      await this.handleCancelCommand(message);
      return;
    }

    // Wait for any existing processing of this conversation to complete
    let existingLock = this.conversationLocks.get(conversationId);
    if (existingLock) {
      await existingLock;
    }

    // Create new lock for this message
    const lockPromise = this.handleMessageInternal(message);

    // Store lock so concurrent messages wait for it
    this.conversationLocks.set(conversationId, lockPromise);

    try {
      await lockPromise;
    } finally {
      // Clean up lock after processing completes
      this.conversationLocks.delete(conversationId);
    }
  }

  /**
   * Internal message handling implementation
   */
  private async handleMessageInternal(message: IncomingMessage): Promise<void> {
    let progressMessageId: string | undefined = undefined;
    const thinkingEvents: string[] = [];
    let immediateUpdateTimer: NodeJS.Timeout | undefined = undefined;

    // Get channel once at the beginning (cached for error handling)
    const channelId = message.metadata?.channelId as string;
    const channel = this.router.getChannel(channelId);

    try {
      this.logger.debug('[Gateway] Handling message', {
        messageId: message.id,
        conversationId: message.conversationId,
        contentLength: message.content.length
      });

      this.logger.debug('[Gateway] User message', {
        content: message.content.substring(0, 100) // Truncate for logging
      });
      this.emit('message:incoming', message);

      // Validate channel exists early
      if (!channel) {
        throw new Error(`No channel found for: ${channelId}`);
      }

      // Get or create session
      const session = await this.sessions.getOrCreate(message);
      this.logger.debug('[Gateway] Session created', {
        sessionId: session.id,
        conversationId: message.conversationId
      });

      // Route to provider FIRST (to start processing immediately)
      this.logger.debug('[Gateway] Routing to provider');
      const startTime = Date.now();

      const responses = await this.router.route(session, message);
      this.logger.debug('[Gateway] Got response stream');

      // Send "thinking" indicator AFTER getting stream (immediate user feedback)
      if (channel.updateMessage) {
        progressMessageId = await channel.sendMessage({
          conversationId: message.conversationId,
          content: '🤔 **Thinking...** (0.0s)'
        });

        // Start periodic time updates every second (immediate feedback)
        immediateUpdateTimer = setInterval(() => {
          if (progressMessageId && channel.updateMessage) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            if (thinkingEvents.length > 0) {
              // Show thinking events if we have them
              channel.updateMessage(progressMessageId, this.buildThinkingDisplay(elapsed, thinkingEvents))
                .catch(() => {});
            } else {
              // Just show elapsed time while waiting
              channel.updateMessage(progressMessageId, `🤔 **Thinking...** (${elapsed}s)`)
                .catch(() => {});
            }
          }
        }, 1000); // Update every second
      }

      // Collect response
      let assistantContent = '';
      let chunkCount = 0;

      try {
        for await (const response of responses) {
          // Handle thinking events - add to array for display
          // Validate thinking object has required structure
          if (response.thinking && typeof response.thinking === 'object' && response.thinking.type) {
            const thinkingText = this.formatThinkingEvent(response.thinking);
            thinkingEvents.push(thinkingText);

            // Update IMMEDIATELY when thinking event arrives (don't wait for interval)
            if (progressMessageId && channel.updateMessage) {
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              channel.updateMessage(progressMessageId, this.buildThinkingDisplay(elapsed, thinkingEvents))
                .catch(() => {});
            }
          }
          // Handle content
          if (response.content) {
            assistantContent += response.content;
            chunkCount++;
          }

          if (response.done) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            this.logger.debug('[Gateway] Response complete', {
              chunkCount,
              contentLength: assistantContent.length,
              elapsedSeconds: elapsed
            });

            // Send final response
            if (progressMessageId && channel.updateMessage) {
              channel.updateMessage(progressMessageId, assistantContent, message.conversationId)
                .catch((err) => this.logger?.warn('Failed to update final message', {
                  error: err instanceof Error ? err.message : String(err)
                }));
            } else {
              await channel.sendMessage({
                conversationId: message.conversationId,
                content: assistantContent
              });
            }

            // Add assistant message to session
            this.sessions.addMessage(session.id, {
              role: 'assistant',
              content: assistantContent
            });
          }
        }

        this.emit('message:handled', {
          sessionId: session.id,
          conversationId: message.conversationId
        });
      } finally {
        // Ensure timer is always cleared, regardless of success/failure
        if (immediateUpdateTimer) {
          clearInterval(immediateUpdateTimer);
          immediateUpdateTimer = undefined;
        }
      }
    } catch (error) {
      // Send error message using cached channel reference
      const errorMessage = `❌ **Error:** ${error instanceof Error ? error.message : 'Unknown error'}`;

      if (channel) {
        if (progressMessageId && channel.updateMessage) {
          // Update existing progress message with error
          channel.updateMessage(progressMessageId, errorMessage).catch(() => {});
        } else {
          // Send new error message (fallback for early errors)
          channel.sendMessage({
            conversationId: message.conversationId,
            content: errorMessage
          }).catch(() => {});
        }
      }

      this.logger.error('[Gateway] Failed to handle message', {
        messageId: message.id,
        conversationId: message.conversationId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : String(error)
      });
      this.emit('message:error', { message, error });
      throw error;
    }
  }

  /**
   * Format thinking event for display (compact)
   */
  private formatThinkingEvent(thinking: { type: string; name?: string; content?: string; input?: string }): string {
    switch (thinking.type) {
      case 'tool_use':
        if (thinking.input && thinking.input.length > 60) {
          return `🔧 ${thinking.name}`;
        }
        return `🔧 ${thinking.name} ${thinking.input || ''}`;
      case 'thinking':
        const content = thinking.content || '...';
        return `💭 ${content.substring(0, 60)}`;
      default:
        return `⚡ ${thinking.type}`;
    }
  }

  /**
   * Build thinking display (compact format)
   */
  private buildThinkingDisplay(elapsed: string, events: string[]): string {
    const lines = [`🤔 **Thinking...** (${elapsed}s)`];

    // Add last 3 unique events
    const uniqueEvents = [...new Set(events)];
    lines.push(...uniqueEvents.slice(-3));

    return lines.join('\n');
  }

  /**
   * Helper method to send message through channel with error handling
   */
  private async sendChannelMessage(
    channel: Channel,
    conversationId: string,
    content: string,
    updateMessageId?: string
  ): Promise<void> {
    if (!channel) {
      this.logger.warn('Cannot send message: no channel provided');
      return;
    }

    try {
      if (updateMessageId && channel.updateMessage) {
        await channel.updateMessage(updateMessageId, content);
      } else {
        await channel.sendMessage({ conversationId, content });
      }
    } catch (error) {
      this.logger.error('Failed to send channel message', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle /cancel command - terminate active request for a conversation
   */
  private async handleCancelCommand(message: IncomingMessage): Promise<void> {
    this.logger.debug('[Gateway] Handling /cancel command', {
      conversationId: message.conversationId
    });

    // Get channel from metadata
    const channelId = message.metadata?.channelId as string;
    const channel = this.router.getChannel(channelId);
    if (!channel) {
      this.logger.warn('[Gateway] No channel found for cancel command', { channelId });
      return;
    }

    // Get session (conversationId = sessionId in our system)
    const session = this.sessions.getByConversation(message.conversationId);
    if (!session) {
      await this.sendChannelMessage(channel, message.conversationId, this.MESSAGES.NO_ACTIVE_REQUEST);
      this.logger.debug('[Gateway] No session found for cancel', {
        conversationId: message.conversationId
      });
      return;
    }

    // Get provider from session data, or fallback to first available with cancel support
    const providerId = session.data.providerId as string;
    let provider = providerId ? this.router.getProvider(providerId) : undefined;

    // Fallback: find first provider that supports cancel
    if (!provider) {
      const providers = this.router.getProviders();
      provider = providers.find(p => typeof (p as any).cancelRequest === 'function');
      this.logger.debug('[Gateway] Using fallback provider', {
        providerId: provider?.id || 'none',
        sessionId: session.id
      });
    }

    if (!provider) {
      await this.sendChannelMessage(channel, message.conversationId, this.MESSAGES.NO_AVAILABLE_PROVIDER);
      this.logger.warn('[Gateway] No provider available for cancel', {
        sessionId: session.id
      });
      return;
    }

    // Check if provider supports cancel operation
    if (typeof (provider as any).cancelRequest !== 'function') {
      await this.sendChannelMessage(channel, message.conversationId, this.MESSAGES.PROVIDER_NOT_SUPPORTED);
      this.logger.debug('[Gateway] Provider does not support cancel', {
        providerId: provider.id
      });
      return;
    }

    // Attempt cancellation
    const cancelled = (provider as any).cancelRequest(session.id);
    this.logger.debug('[Gateway] Cancel result', {
      sessionId: session.id,
      cancelled
    });

    // Send response message
    const responseContent = cancelled ? this.MESSAGES.REQUEST_CANCELLED : this.MESSAGES.NO_ACTIVE_REQUEST;
    await this.sendChannelMessage(channel, message.conversationId, responseContent);
  }

  /**
   * Handle /model command - switch AI model for the session
   */
  private async handleModelCommand(
    message: IncomingMessage,
    modelAlias: string
  ): Promise<void> {
    this.logger.debug('[Gateway] Handling /model command for conversation:', message.conversationId);

    const channelId = message.metadata?.channelId as string;
    const channel = this.router.getChannel(channelId);
    if (!channel) {
      this.logger.debug('[Gateway] No channel found for model command:', channelId);
      return;
    }

    // No argument: show current model and available models
    if (!modelAlias) {
      const session = await this.sessions.getOrCreate(message);
      const currentModel = (session.data.model as string) || 'default';
      const currentDisplayName = MODEL_DISPLAY_NAMES[currentModel] || currentModel;

      const modelsList = Object.entries(MODEL_DISPLAY_NAMES)
        .map(([alias, name]) => {
          const isCurrent = alias === currentModel ? ' ← 当前' : '';
          return `- ${alias.padEnd(10)} - ${name}${isCurrent}`;
        })
        .join('\n');

      await channel.sendMessage({
        conversationId: message.conversationId,
        content: `📊 **当前模型:** ${currentDisplayName}\n\n**可用模型:**\n${modelsList}`
      });
      return;
    }

    // Validate model alias
    const normalizedAlias = modelAlias.toLowerCase();
    if (!MODEL_ALIASES[normalizedAlias]) {
      const availableModels = Object.keys(MODEL_ALIASES).join(', ');
      await channel.sendMessage({
        conversationId: message.conversationId,
        content: `❌ 未知模型: ${modelAlias}\n\n可用模型: ${availableModels}`
      });
      return;
    }

    // Get or create session and update model setting
    const session = await this.sessions.getOrCreate(message);
    const displayName = MODEL_DISPLAY_NAMES[normalizedAlias];

    // Update session model with alias (router will convert to appropriate value for each provider)
    session.data.model = normalizedAlias;
    session.lastActivity = new Date();

    await channel.sendMessage({
      conversationId: message.conversationId,
      content: `✅ 模型已切换为: **${displayName}**\n\n当前会话将使用新模型。`
    });

    this.logger?.info(`Model switched for session ${session.id}: ${displayName} (${normalizedAlias})`);
  }

  /**
   * Register a channel
   */
  registerChannel(channel: Channel, config?: object): void {
    // Store config for later initialization
    if (config) {
      this.channelConfigs.set(channel.id, config);
    }

    // Add message handler
    channel.onMessage(async (msg) => {
      // Add channel metadata
      msg.metadata = { ...msg.metadata, channelId: channel.id };
      await this.handleMessage(msg);
    });

    // Register with router
    this.router.registerChannel(channel);

    this.logger.info(`Channel registered: ${channel.id}`);
    this.emit('channel:registered', { id: channel.id, name: channel.name });
  }

  /**
   * Unregister a channel
   */
  async unregisterChannel(channelId: string): Promise<void> {
    const channel = this.router.getChannel(channelId);
    if (channel) {
      await channel.dispose();
    }

    this.router.unregisterChannel(channelId);

    this.logger.info(`Channel unregistered: ${channelId}`);
    this.emit('channel:unregistered', { id: channelId });
  }

  /**
   * Register a provider
   */
  registerProvider(provider: AIProvider, config?: object): void {
    // Store config for later initialization
    if (config) {
      this.providerConfigs.set(provider.id, config);
    }

    this.router.registerProvider(provider);

    this.logger.info(`Provider registered: ${provider.id}`);
    this.emit('provider:registered', { id: provider.id, name: provider.name });
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    this.router.unregisterProvider(providerId);

    this.logger.info(`Provider unregistered: ${providerId}`);
    this.emit('provider:unregistered', { id: providerId });
  }

  /**
   * Get gateway status (optimized with functional reduce)
   */
  getStatus(): GatewayStatus {
    const plugins = this.plugins.list();
    const channels = this.router.getChannels();
    const providers = this.router.getProviders();

    // Use reduce for single-pass calculations (functional approach)
    const channelStats = channels.reduce(
      (acc, ch) => ({
        ...acc,
        connected: acc.connected + (ch.getStatus().connected ? 1 : 0)
      }),
      { connected: 0 }
    );

    const providerStats = providers.reduce(
      (acc, pr) => ({
        ...acc,
        available: acc.available + (pr.getStatus().available ? 1 : 0)
      }),
      { available: 0 }
    );

    const pluginStats = plugins.reduce(
      (acc, pl) => ({
        loaded: acc.loaded + (pl.loaded ? 1 : 0),
        started: acc.started + (pl.started ? 1 : 0)
      }),
      { loaded: 0, started: 0 }
    );

    return {
      id: this.id,
      running: this._running,
      channels: {
        total: channels.length,
        connected: channelStats.connected,
        disconnected: channels.length - channelStats.connected
      },
      providers: {
        total: providers.length,
        available: providerStats.available,
        unavailable: providers.length - providerStats.available
      },
      sessions: this.sessions.getStats(),
      plugins: {
        total: plugins.length,
        loaded: pluginStats.loaded,
        started: pluginStats.started
      },
      uptime: this._startTime ? Date.now() - this._startTime.getTime() : undefined
    };
  }

  /**
   * Register components from plugins
   */
  private registerPluginComponents(): void {
    // Register channel plugins
    const channelPlugins = this.plugins.getByType<any>('channel');
    for (const plugin of channelPlugins) {
      if (typeof plugin.createChannel === 'function') {
        const channels = this.configStore.get<object[]>(`channels.${plugin.id}`, []);
        for (const config of channels) {
          try {
            const channel = plugin.createChannel(config);
            this.registerChannel(channel, config);
          } catch (error) {
            this.logger.error(`Failed to create channel from plugin ${plugin.id}: ${error}`);
          }
        }
      }
    }

    // Register provider plugins
    const providerPlugins = this.plugins.getByType<any>('provider');
    for (const plugin of providerPlugins) {
      if (typeof plugin.createProvider === 'function') {
        const providers = this.configStore.get<object[]>(`providers.${plugin.id}`, []);
        for (const config of providers) {
          try {
            const provider = plugin.createProvider(config);
            this.registerProvider(provider, config);
          } catch (error) {
            this.logger.error(`Failed to create provider from plugin ${plugin.id}: ${error}`);
          }
        }
      }
    }
  }
}
