/**
 * Channel Interface - Defines the contract for all messaging platform integrations
 * @module channels
 */

export interface Channel {
  /** Unique channel identifier */
  id: string;

  /** Channel name */
  name: string;

  /** Channel type (telegram, discord, whatsapp, etc.) */
  type: string;

  /**
   * Initialize the channel with configuration
   */
  initialize(config: ChannelConfig): Promise<void>;

  /**
   * Start the channel
   */
  start(): Promise<void>;

  /**
   * Stop the channel
   */
  stop(): Promise<void>;

  /**
   * Send a message through this channel
   * @returns Optional message ID for updates (if supported by channel)
   */
  sendMessage(message: OutgoingMessage): Promise<string | undefined>;

  /**
   * Update an existing message (optional, for progress feedback)
   * Not all channels support this feature
   * @param messageId - ID of the message to update
   * @param content - New content for the message
   * @param conversationId - Optional conversation ID for sending additional parts if content is too long
   */
  updateMessage?(messageId: string, content: string, conversationId?: string): Promise<void>;

  /**
   * Subscribe to incoming message events
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Get current channel status
   */
  getStatus(): ChannelStatus;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}

export interface ChannelConfig {
  /** Authentication token */
  token?: string;

  /** Webhook URL */
  webhookUrl?: string;

  /** Custom options */
  options?: Record<string, unknown>;
}

export interface IncomingMessage {
  /** Message ID */
  id: string;

  /** Source user ID */
  userId: string;

  /** Source conversation ID */
  conversationId: string;

  /** Message content */
  content: string;

  /** Attachments */
  attachments?: Attachment[];

  /** Timestamp */
  timestamp: Date;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  /** Target conversation ID */
  conversationId: string;

  /** Message content */
  content: string;

  /** Attachments */
  attachments?: Attachment[];

  /** Message options */
  options?: MessageOptions;
}

export interface Attachment {
  /** Attachment type */
  type: 'image' | 'video' | 'audio' | 'file' | 'location';

  /** Attachment URL or data */
  url?: string;

  /** MIME type */
  mimeType?: string;

  /** File name */
  filename?: string;

  /** File size in bytes */
  size?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface MessageOptions {
  /** Parse mode (markdown, html, etc.) */
  parseMode?: 'markdown' | 'html' | 'none';

  /** Silent message (no notification) */
  silent?: boolean;

  /** Reply to message ID */
  replyTo?: string;

  /** Keyboard/buttons */
  keyboard?: Keyboard;
}

export interface Keyboard {
  /** Inline keyboard */
  inline?: boolean;

  /** Buttons */
  buttons: KeyboardButton[][];
}

export interface KeyboardButton {
  /** Button text */
  text: string;

  /** Callback data or URL */
  data?: string;

  /** URL for link buttons */
  url?: string;
}

export type MessageHandler = (message: IncomingMessage) => void | Promise<void>;

export interface ChannelStatus {
  /** Is channel connected */
  connected: boolean;

  /** Channel state */
  state: 'disconnected' | 'connecting' | 'connected' | 'error';

  /** Error message if in error state */
  error?: string;

  /** Connection timestamp */
  connectedAt?: Date;

  /** Additional status info */
  info?: Record<string, unknown>;
}
