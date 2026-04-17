/**
 * Lark/Feishu Channel Implementation (WebSocket Mode)
 */

import https from 'node:https';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import axios, { type AxiosInstance } from 'axios';
import type * as LarkSDK from '@larksuiteoapi/node-sdk';
import type {
  Channel,
  ChannelConfig,
  IncomingMessage,
  OutgoingMessage,
  ChannelStatus,
  Attachment,
} from '@buuo/core';
import type {
  LarkConfig,
  LarkMessageContent,
  LarkSendMessageOptions,
} from './types.js';

/** Lark API response types */
interface LarkMessageResponse {
  code: number;
  msg?: string;
  data?: {
    message_id?: string;
  };
  message_id?: string;
}

interface LarkTokenResponse {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

interface LarkSdkHttpInstance {
  request<T = unknown>(opts: Record<string, unknown>): Promise<T>;
  get<T = unknown>(url: string, opts?: Record<string, unknown>): Promise<T>;
  delete<T = unknown>(url: string, opts?: Record<string, unknown>): Promise<T>;
  head<T = unknown>(url: string, opts?: Record<string, unknown>): Promise<T>;
  options<T = unknown>(url: string, opts?: Record<string, unknown>): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, opts?: Record<string, unknown>): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, opts?: Record<string, unknown>): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, opts?: Record<string, unknown>): Promise<T>;
}

/** Constants for Lark channel configuration */
const LARK_CONSTANTS = {
  /** Maximum tables per message (Feishu allows ~10) */
  TABLE_LIMIT: 8,
  /** Conservative character limit per message */
  CHAR_LIMIT: 12000,
  /** Update character limit */
  UPDATE_CHAR_LIMIT: 10000,
  /** Maximum cached message IDs for deduplication */
  MAX_CACHED_MESSAGE_IDS: 1000,
  /** Heartbeat check interval (ms) */
  HEARTBEAT_INTERVAL: 300000,
  /** WebSocket retry interval (ms) */
  RETRY_INTERVAL: 1000,
  /** Maximum retry count */
  MAX_RETRY_COUNT: 5,
  /** Delay between message parts (ms) */
  MESSAGE_PART_DELAY: 1000,
  /** Delay for additional update parts (ms) */
  UPDATE_PART_DELAY: 800,
  /** Image download timeout (ms) */
  IMAGE_DOWNLOAD_TIMEOUT: 30000,
  /** Token expiry buffer (seconds) - refresh 1 hour early */
  TOKEN_EXPIRY_BUFFER: 3600,
} as const;

/**
 * LRU Cache for message deduplication
 */
class LRUCache<K, V> {
  private readonly cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove existing key if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Add to end
    this.cache.set(key, value);
    // Evict oldest if at capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

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
  private _heartbeatTimer?: NodeJS.Timeout;
  private sdkAxios?: AxiosInstance;
  private sdkHttp?: LarkSdkHttpInstance;
  private sdkAgent?: https.Agent;
  private tenantAccessToken?: string;
  private tokenExpireTime?: number;
  private imageCacheDir: string;
  private processedMessageIds = new LRUCache<string, true>(LARK_CONSTANTS.MAX_CACHED_MESSAGE_IDS);

  constructor(options: { id?: string } = {}) {
    this.id = options.id || 'lark-channel';
    this.name = 'Lark/Feishu Channel';
    this.imageCacheDir = join(tmpdir(), 'buuo-lark-images');
  }

  // Unified logging function with millisecond timestamps
  private log = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}]`, ...args);
  };

  private logError = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.error(`[${timestamp}]`, ...args);
  };

  private logWarn = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.warn(`[${timestamp}]`, ...args);
  };

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
    this.sdkAgent = new https.Agent({ keepAlive: true });
    // Bypass ambient HTTP(S)_PROXY so Feishu long-connection setup is direct.
    this.sdkAxios = axios.create({
      proxy: false,
      timeout: 15000,
      httpsAgent: this.sdkAgent,
      httpAgent: this.sdkAgent,
    });
    this.sdkHttp = this.createSdkHttpWrapper(this.sdkAxios);
    this.client = new this.sdk.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      domain: this.sdk.Domain.Feishu,
      httpInstance: this.sdkHttp,
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
      agent: this.sdkAgent,
      domain: sdk.Domain.Feishu,
      httpInstance: this.sdkHttp,
      loggerLevel: sdk.LoggerLevel.warn, // Reduced from info
    } as any);

    // Start WebSocket connection
    await this.wsClient.start({ eventDispatcher });

    this.log(`✓ Lark WebSocket connected (App: ${this.config.appId})`);

    // Start lightweight heartbeat monitoring
    this.startHeartbeat();
  }

  private createSdkHttpWrapper(client: AxiosInstance): LarkSdkHttpInstance {
    return {
      request: async <T>(opts: Record<string, unknown>) => (await client.request<T>(opts)).data,
      get: async <T>(url: string, opts?: Record<string, unknown>) => (await client.get<T>(url, opts)).data,
      delete: async <T>(url: string, opts?: Record<string, unknown>) => (await client.delete<T>(url, opts)).data,
      head: async <T>(url: string, opts?: Record<string, unknown>) => (await client.head<T>(url, opts)).data,
      options: async <T>(url: string, opts?: Record<string, unknown>) => (await client.options<T>(url, opts)).data,
      post: async <T>(url: string, data?: unknown, opts?: Record<string, unknown>) => (await client.post<T>(url, data, opts)).data,
      put: async <T>(url: string, data?: unknown, opts?: Record<string, unknown>) => (await client.put<T>(url, data, opts)).data,
      patch: async <T>(url: string, data?: unknown, opts?: Record<string, unknown>) => (await client.patch<T>(url, data, opts)).data,
    };
  }

  /**
   * Start lightweight heartbeat monitoring (logs only on issues)
   */
  private startHeartbeat(): void {
    this._heartbeatTimer = setInterval(() => {
      const connected = this.initialized && !!this.wsClient;
      if (!connected) {
        this.logWarn('[Lark] Connection lost');
      }
    }, LARK_CONSTANTS.HEARTBEAT_INTERVAL);
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

    const { conversationId, content } = message;

    // Check if content needs to be split due to table limit
    const parts = this.splitContentIfNeeded(content);

    // If split into multiple parts, send them all
    if (parts.length > 1) {
      this.log(`[Lark] Splitting content into ${parts.length} parts`);
      let lastMessageId: string | undefined;

      for (let i = 0; i < parts.length; i++) {
        const partContent = parts[i];
        const partIndicator = parts.length > 1 ? `\n\n_${i + 1}/${parts.length}_` : '';

        lastMessageId = await this.sendMessageInternal(conversationId, partContent + partIndicator);

        // Add delay between parts to avoid rate limiting
        if (i < parts.length - 1) {
          await this.sleep(LARK_CONSTANTS.MESSAGE_PART_DELAY);
        }
      }

      return lastMessageId;
    }

    // Send single message
    return this.sendMessageInternal(conversationId, content);
  }

  /**
   * Internal method to send a single message
   */
  private async sendMessageInternal(conversationId: string, content: string): Promise<string | undefined> {
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
      }) as LarkMessageResponse;

      // Return message_id for potential updates (access via data property)
      return response.data?.message_id || response.message_id;
    } catch (error) {
      this.logError('Failed to send Lark message:', error);
      throw error;
    }
  }

  /**
   * Split content if it exceeds Feishu limits
   * Feishu limits: ~10 tables per card, ~15000 chars per message
   */
  private splitContentIfNeeded(content: string): string[] {
    const tableCount = this.countMarkdownTables(content);
    const isTooLong = content.length > LARK_CONSTANTS.CHAR_LIMIT || tableCount > LARK_CONSTANTS.TABLE_LIMIT;

    if (!isTooLong) {
      return [content];
    }

    this.log(`[Lark] Content too long: ${content.length} chars, ${tableCount} tables`);
    return this.smartSplitContent(content, LARK_CONSTANTS.TABLE_LIMIT, LARK_CONSTANTS.CHAR_LIMIT);
  }

  /**
   * Count markdown tables in content
   */
  private countMarkdownTables(content: string): number {
    // Match markdown tables: lines starting with | and containing ||
    const lines = content.split('\n');
    let tableCount = 0;
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();
      // Table row: starts with | and has at least one more |
      if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
        if (!inTable) {
          tableCount++;
          inTable = true;
        }
      } else if (inTable && trimmed === '') {
        // Empty line ends table
        inTable = false;
      } else if (!trimmed.startsWith('|')) {
        inTable = false;
      }
    }

    return tableCount;
  }

  /**
   * Smart content splitting at logical boundaries
   */
  private smartSplitContent(content: string, tableLimit: number, charLimit: number): string[] {
    const parts: string[] = [];
    const lines = content.split('\n');
    let currentPart: string[] = [];
    let currentTables = 0;
    let currentChars = 0;
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const isTableRow = trimmed.startsWith('|') && trimmed.includes('|', 1);
      const isEmpty = trimmed === '';

      // Check if this line starts/ends a table
      if (isTableRow && !inTable) {
        // Starting a new table
        if (currentTables >= tableLimit || currentChars + line.length > charLimit) {
          // Current part is full, save it
          parts.push(currentPart.join('\n'));
          currentPart = [];
          currentTables = 0;
          currentChars = 0;
        }
        currentTables++;
        inTable = true;
      } else if (!isTableRow && !isEmpty && inTable) {
        inTable = false;
      } else if (isEmpty) {
        inTable = false;
      }

      // Add line to current part
      currentPart.push(line);
      currentChars += line.length + 1; // +1 for newline

      // Check if we need to split (but not in the middle of a table)
      if (!inTable && currentChars > charLimit * 0.9) {
        // Find a good split point (empty line or heading)
        if (isEmpty || trimmed.startsWith('#')) {
          parts.push(currentPart.join('\n'));
          currentPart = [];
          currentTables = 0;
          currentChars = 0;
        }
      }
    }

    // Add remaining content
    if (currentPart.length > 0) {
      parts.push(currentPart.join('\n'));
    }

    return parts.filter(p => p.trim().length > 0);
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update an existing message (for progress feedback)
   * If content is too long, truncate and send remaining as new messages
   */
  async updateMessage(messageId: string, content: string, conversationId?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Lark channel not initialized');
    }

    // Check if content needs truncation for update
    const needsSplit = content.length > LARK_CONSTANTS.UPDATE_CHAR_LIMIT || this.countMarkdownTables(content) > 5;

    if (needsSplit && conversationId) {
      // Content too long for update - truncate and send rest as new messages
      const parts = this.smartSplitContent(content, 5, LARK_CONSTANTS.UPDATE_CHAR_LIMIT);

      // Update with first part (truncated)
      await this.updateMessageInternal(messageId, parts[0]);

      // Send remaining parts as new messages
      if (parts.length > 1) {
        this.log(`[Lark] Update truncated, sending ${parts.length - 1} additional parts`);
        for (let i = 1; i < parts.length; i++) {
          await this.sleep(LARK_CONSTANTS.UPDATE_PART_DELAY);
          await this.sendMessageInternal(conversationId, parts[i] + `\n\n_${i + 1}/${parts.length}_`);
        }
      }
    } else {
      // Short content, update directly (truncate if still too long)
      const truncatedContent = content.length > LARK_CONSTANTS.UPDATE_CHAR_LIMIT
        ? content.slice(0, LARK_CONSTANTS.UPDATE_CHAR_LIMIT) + '\n\n_(Content truncated, full response sent separately)_'
        : content;

      await this.updateMessageInternal(messageId, truncatedContent);
    }
  }

  /**
   * Internal method to update a message
   */
  private async updateMessageInternal(messageId: string, content: string): Promise<void> {
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
      this.logError('Failed to update Lark message:', error);
      // Non-fatal: don't throw on update failures
    }
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
      info: connected ? {
        mode: 'WebSocket (no public IP required)',
        appId: this.config!.appId,
      } : undefined,
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
  private async handleMessageEvent(data: any): Promise<void> {
    if (!data || !data.message) {
      return;
    }

    const { sender, message } = data;

    // Message deduplication - skip already processed messages (LRU cache)
    const messageId = message.message_id;
    if (!messageId || this.processedMessageIds.has(messageId)) {
      return; // Skip duplicate or invalid messages
    }
    this.processedMessageIds.set(messageId, true);

    // Parse message content and extract attachments
    let content = '';
    let attachments: Attachment[] = [];

    try {
      const messageContent = JSON.parse(message.content);

      // Handle different message types
      if (message.message_type === 'image') {
        // Image message: create attachment with clear instruction
        const imageKey = messageContent.image_key;
        if (imageKey) {
          const attachment = await this.downloadAndAttachImage(message.message_id, imageKey);
          if (attachment) {
            // Use neutral text that won't trigger image analysis
            content = '[图片]';
            attachments.push(attachment);
          } else {
            // Image download failed - add note to content
            content = '[图片加载失败]';
          }
        }
      } else {
        // Text or other message types
        content = messageContent.text || messageContent.content || '';
      }
    } catch {
      content = message.content || '';
    }

    // Build incoming message
    const incomingMessage: IncomingMessage = {
      id: message.message_id,
      userId: sender?.sender_id?.open_id || '',
      conversationId: message.chat_id,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
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
            this.logError('[Lark] Handler error:', error);
          }
        })
      ).catch(err => this.logError('[Lark] Handler batch error:', err));
    }
  }

  /**
   * Download image from Lark and return as attachment
   * Uses message resource API for user-sent images
   * Reference: https://open.feishu.cn/document/server-docs/im-v1/message-resource-get
   */
  private async downloadAndAttachImage(
    messageId: string,
    imageKey: string
  ): Promise<Attachment | null> {
    try {
      // Get tenant access token
      const token = await this.getTenantAccessToken();

      // Create image cache directory
      await mkdir(this.imageCacheDir, { recursive: true });

      // Generate unique filename
      const filename = `lark_${imageKey}_${Date.now()}.jpg`;
      const filePath = join(this.imageCacheDir, filename);

      // Download image using message resource API
      await this.downloadImageViaMessageResource(messageId, imageKey, filePath, token);

      // Return attachment with local file path
      return {
        type: 'image',
        url: filePath,
        mimeType: 'image/jpeg',
        metadata: { imageKey, messageId, platform: 'lark' },
      };
    } catch (error) {
      this.logError(`[Lark] Image download failed: ${error}`);
      // Return attachment with error metadata
      return {
        type: 'image',
        url: '',
        mimeType: 'image/jpeg',
        metadata: { imageKey, messageId, platform: 'lark', error: String(error) },
      };
    }
  }

  /**
   * Download image using message resource API
   * API: GET /open-apis/im/v1/messages/{message_id}/resources/{file_key}?type=image
   */
  private async downloadImageViaMessageResource(
    messageId: string,
    fileKey: string,
    filePath: string,
    token: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'open.feishu.cn',
        path: `/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=image`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      };

      this.log(`[Lark] Downloading image: msg=${messageId}, key=${fileKey}`);

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => { chunks.push(chunk); });
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            this.log(`[Lark] ✓ Downloaded ${buffer.length} bytes`);
            writeFile(filePath, buffer).then(() => resolve()).catch(reject);
          });
        } else {
          let errorData = '';
          res.on('data', (chunk) => { errorData += chunk; });
          res.on('end', () => {
            this.logError(`[Lark] ✗ Download failed ${res.statusCode}: ${errorData.substring(0, 200)}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          });
        }
      });

      req.on('error', (err) => {
        this.logError('[Lark] Request error:', err);
        reject(err);
      });

      req.setTimeout(LARK_CONSTANTS.IMAGE_DOWNLOAD_TIMEOUT, () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });

      req.end();
    });
  }

  /**
   * Get tenant access token for API authentication
   */
  private async getTenantAccessToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.tenantAccessToken && this.tokenExpireTime && Date.now() < this.tokenExpireTime) {
      return this.tenantAccessToken;
    }

    // Get new token from Lark API
    try {
      const response = await this.client.auth.v3.tenantAccessToken.internal({
        data: {
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        },
      }) as LarkTokenResponse;

      if (response.code === 0 && response.tenant_access_token) {
        const token = response.tenant_access_token;
        this.tenantAccessToken = token;
        // Token expires in 2 hours, set expiry early for safety
        this.tokenExpireTime = Date.now() + ((response.expire || 7200) - LARK_CONSTANTS.TOKEN_EXPIRY_BUFFER) * 1000;
        return token;
      }

      throw new Error(`Failed to get tenant token: ${response.msg}`);
    } catch (error) {
      this.logError('[Lark] Get tenant token error:', error);
      throw error;
    }
  }

}
