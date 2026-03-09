/**
 * Gateway - Main gateway class coordinating all components
 * @module gateway
 */

import { EventEmitter } from 'eventemitter3';
import type { Channel, IncomingMessage } from '../channels/interface.js';
import type { AIProvider } from '../providers/interface.js';
import type { PluginManager } from '../plugins/manager.js';
import type { ConfigStore } from '../config/store.js';
import type { Logger } from '../utils/logger.js';
import { SessionManager, type SessionOptions } from './session.js';
import { MessageRouter, type RouterOptions } from './router.js';

export interface GatewayConfig {
  /** Gateway ID */
  id?: string;

  /** Session options */
  session?: SessionOptions;

  /** Router options */
  router?: RouterOptions;

  /** Auto-start plugins */
  autoStartPlugins?: boolean;

  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
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
  private _cleanupTimer?: NodeJS.Timeout;
  private readonly channelConfigs = new Map<string, object>(); // Store channel configs
  private readonly providerConfigs = new Map<string, object>(); // Store provider configs

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

    // Start cleanup timer
    const cleanupInterval = this.config.cleanupInterval ?? 300000; // 5 minutes
    this._cleanupTimer = setInterval(() => {
      this.sessions.cleanup().catch(err => {
        this.logger.error(`Session cleanup failed: ${err}`);
      });
    }, cleanupInterval);

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

    // Clear cleanup timer
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = undefined;
    }

    this._running = false;
    this.logger.info('Gateway stopped');
    this.emit('stopped');
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message: IncomingMessage): Promise<void> {
    try {
      console.log('[Gateway] handleMessage called:', message.id);
      console.log('[Gateway] User message:', message.content);
      this.emit('message:incoming', message);

      // Get or create session
      const session = await this.sessions.getOrCreate(message);
      console.log('[Gateway] Session:', session.id);

      // Add user message to session
      this.sessions.addMessage(session.id, {
        role: 'user',
        content: message.content
      });

      // Route to provider
      console.log('[Gateway] Routing to provider...');
      const responses = await this.router.route(session, message);
      console.log('[Gateway] Got response stream');

      // Collect response and send to channel
      let assistantContent = '';
      const channel = this.router.getChannelForConversation(message.conversationId);
      if (!channel) {
        throw new Error(`No channel found for conversation: ${message.conversationId}`);
      }

      console.log('[Gateway] Processing response stream...');
      let chunkCount = 0;
      for await (const response of responses) {
        if (response.content) {
          assistantContent += response.content;
          chunkCount++;
          // Show progress every 20 chunks
          if (chunkCount % 20 === 0) {
            process.stdout.write('.');
          }
        }

        if (response.done) {
          if (chunkCount > 0) process.stdout.write('\n');
          console.log(`[Gateway] Stream complete: ${chunkCount} chunks, ${assistantContent.length} chars`);
          // Send response to channel
          await channel.sendMessage({
            conversationId: message.conversationId,
            content: assistantContent
          });
          console.log('[Gateway] Message sent to channel');

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
    } catch (error) {
      console.error('[Gateway] Failed to handle message:', error);
      this.logger.error(`Failed to handle message: ${error}`);
      this.emit('message:error', { message, error });
      throw error;
    }
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
   * Get gateway status (optimized with single pass)
   */
  getStatus(): GatewayStatus {
    const plugins = this.plugins.list();
    const channels = this.router.getChannels();
    const providers = this.router.getProviders();

    // Single pass for channels instead of multiple filter calls
    let connectedChannels = 0;
    for (const channel of channels) {
      if (channel.getStatus().connected) connectedChannels++;
    }

    // Single pass for providers instead of multiple filter calls
    let availableProviders = 0;
    for (const provider of providers) {
      if (provider.getStatus().available) availableProviders++;
    }

    // Single pass for plugins
    let loadedPlugins = 0;
    let startedPlugins = 0;
    for (const plugin of plugins) {
      if (plugin.loaded) loadedPlugins++;
      if (plugin.started) startedPlugins++;
    }

    return {
      id: this.id,
      running: this._running,
      channels: {
        total: channels.length,
        connected: connectedChannels,
        disconnected: channels.length - connectedChannels
      },
      providers: {
        total: providers.length,
        available: availableProviders,
        unavailable: providers.length - availableProviders
      },
      sessions: this.sessions.getStats(),
      plugins: {
        total: plugins.length,
        loaded: loadedPlugins,
        started: startedPlugins
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
