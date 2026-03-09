/**
 * Lark/Feishu Channel Implementation (WebSocket Mode)
 */

import type * as LarkSDK from '@larksuiteoapi/node-sdk';
import type {
  Channel,
  ChannelConfig,
  IncomingMessage,
  OutgoingMessage,
  ChannelStatus,
} from '@buuo/core';
import type {
  LarkConfig,
  LarkEvent,
  LarkMessageContent,
  LarkSendMessageOptions,
} from './types.js';

/**
 * Lark/Feishu channel for Buuo AI Assistant
 * Uses WebSocket long connection mode (no public IP required)
 */
export class LarkChannel implements Channel {
  readonly id: string;
  readonly name: string;
  readonly type = 'lark';

  private config!: LarkConfig;
  private client!: LarkSDK.Client;
  private sdk!: typeof LarkSDK; // Cache SDK import
  private wsClient?: any; // Lark.WSClient
  private initialized = false;
  private messageHandlers: Array<(message: IncomingMessage) => void | Promise<void>> = [];
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(options: { id?: string } = {}) {
    this.id = options.id || 'lark-channel';
    this.name = 'Lark/Feishu Channel';
  }

  /**
   * Initialize the Lark channel
   */
  async initialize(config: ChannelConfig): Promise<void> {
    const { token, options: channelOptions } = config;

    this.config = {
      appId: token as string,
      appSecret: (channelOptions as any)?.appSecret || '',
      encryptKey: (channelOptions as any)?.encryptKey,
      verificationToken: (channelOptions as any)?.verificationToken,
    };

    // Validate required config
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error('Lark channel requires appId and appSecret');
    }

    // Load and cache SDK (one-time import)
    this.sdk = await import('@larksuiteoapi/node-sdk');
    this.client = new this.sdk.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: this.sdk.LoggerLevel.error,
    });

    this.initialized = true;
  }

  /**
   * Start the Lark channel (connect via WebSocket)
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Lark channel not initialized');
    }

    // Use cached SDK
    const sdk = this.sdk;

    // Create EventDispatcher and register event handlers
    const eventDispatcher = new sdk.EventDispatcher({}).register({
      'im.message.receive_v1': this.handleMessageEvent.bind(this),
    });

    // Create WebSocket client for long connection
    this.wsClient = new sdk.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: sdk.LoggerLevel.warn, // Reduced from info
      domain: 'https://open.feishu.cn',
      retryInterval: 1000,
      maxRetryCount: 5,
    } as any);

    // Start WebSocket connection
    await this.wsClient.start({ eventDispatcher });

    console.log(`✓ Lark WebSocket connected (App: ${this.config.appId})`);

    // Start lightweight heartbeat monitoring
    this.startHeartbeat();
  }

  /**
   * Start lightweight heartbeat monitoring (logs only on issues)
   */
  private startHeartbeat(): void {
    // Minimal heartbeat: only check connection status every 5 minutes
    this.heartbeatTimer = setInterval(() => {
      const connected = this.initialized && !!this.wsClient;
      if (!connected) {
        console.warn(`[Lark] Connection lost, attempting to reconnect...`);
      }
    }, 300000); // 5 minutes instead of 30 seconds
  }

  /**
   * Stop the Lark channel
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      await this.wsClient.close();
      this.wsClient = undefined;
    }
  }

  /**
   * Send message through Lark
   * Returns message_id for later updates
   */
  async sendMessage(message: OutgoingMessage): Promise<string | undefined> {
    if (!this.initialized) {
      throw new Error('Lark channel not initialized');
    }

    const { conversationId, content, options } = message;

    // Parse conversationId to get receive_id and receive_id_type
    // Format: "receive_id|receive_id_type" or just "receive_id" (default to chat_id)
    let receiveId: string;
    let receiveIdType: 'open_id' | 'user_id' | 'union_id' | 'chat_id' = 'chat_id';

    if (conversationId.includes('|')) {
      [receiveId, receiveIdType] = conversationId.split('|') as [string, typeof receiveIdType];
    } else {
      receiveId = conversationId;
    }

    // Build message content with Markdown support
    // Use Feishu card JSON 2.0 format (official)
    // Reference: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text
    const msgContent: LarkMessageContent = {
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'markdown',
            content: content,
          },
        ],
      },
    };

    const sendOptions: LarkSendMessageOptions = {
      receiveIdType,
      msgType: 'interactive',
      content: msgContent,
    };

    try {
      // Send message via Lark API
      const response = await this.client.im.message.create({
        params: {
          receive_id_type: sendOptions.receiveIdType,
        },
        data: {
          receive_id: receiveId,
          msg_type: sendOptions.msgType,
          content: JSON.stringify(sendOptions.content),
        },
      });
      // Return message_id for potential updates (access via data property)
      return (response as any)?.data?.message_id || (response as any)?.message_id;
    } catch (error) {
      console.error('Failed to send Lark message:', error);
      throw error;
    }
  }

  /**
   * Update an existing message (for progress feedback)
   */
  async updateMessage(messageId: string, content: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Lark channel not initialized');
    }

    const msgContent: LarkMessageContent = {
      schema: '2.0',
      body: {
        elements: [
          {
            tag: 'markdown',
            content: content,
          },
        ],
      },
    };

    try {
      await this.client.im.message.patch({
        path: {
          message_id: messageId,
        },
        data: {
          content: JSON.stringify(msgContent),
        },
      });
    } catch (error) {
      console.error('Failed to update Lark message:', error);
      // Non-fatal: don't throw on update failures
    }
  }

  /**
   * Send a "thinking" indicator immediately
   */
  async sendThinkingIndicator(conversationId: string): Promise<string | undefined> {
    const thinkingContent = '🤔 **Thinking...**\n\n_Please wait while I process your request._';
    return this.sendMessage({
      conversationId,
      content: thinkingContent,
    });
  }

  /**
   * Subscribe to message events
   */
  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Get channel status
   */
  getStatus(): ChannelStatus {
    const connected = this.initialized && !!this.wsClient;
    return {
      connected,
      state: connected ? 'connected' : 'disconnected',
      info: {
        mode: 'WebSocket (no public IP required)',
        appId: this.config.appId,
      },
    };
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    await this.stop();
    this.messageHandlers = [];
    this.initialized = false;
  }

  /**
   * Handle message event from Lark (optimized)
   */
  private handleMessageEvent(data: any): void {
    if (!data || !data.message) {
      return;
    }

    const { sender, message } = data;

    // Parse message content efficiently
    let content = '';
    try {
      const messageContent = JSON.parse(message.content);
      content = messageContent.text || messageContent.content || '';
    } catch {
      content = message.content || '';
    }

    // Build incoming message
    const incomingMessage: IncomingMessage = {
      id: message.message_id,
      userId: sender?.sender_id?.open_id || '',
      conversationId: message.chat_id,
      content,
      timestamp: new Date(message.create_time || Date.now()),
      metadata: {
        chatType: message.chat_type,
        messageType: message.message_type,
        senderType: sender?.sender_type,
        tenantKey: sender?.tenant_key,
      },
    };

    // Execute handlers in parallel for better performance
    if (this.messageHandlers.length > 0) {
      Promise.all(
        this.messageHandlers.map(async (handler) => {
          try {
            await handler(incomingMessage);
          } catch (error) {
            console.error('[Lark] Handler error:', error);
          }
        })
      ).catch(err => console.error('[Lark] Handler batch error:', err));
    }
  }
}
