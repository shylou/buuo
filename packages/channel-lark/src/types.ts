/**
 * Lark/Feishu API Types
 */

export interface LarkConfig {
  /** App ID from Lark Open Platform */
  appId: string;

  /** App Secret from Lark Open Platform */
  appSecret: string;

  /** Encrypt Key for event verification (optional) */
  encryptKey?: string;

  /** Verification Token for webhook verification (optional) */
  verificationToken?: string;

  /** Server port for webhook (optional) */
  port?: number;

  /** Webhook path (optional) */
  webhookPath?: string;
}

export interface LarkEvent {
  /** Event type */
  type: string;

  /** Event timestamp */
  create_time: string;

  /** Event token for verification */
  token: string;

  /** Event data */
  event: LarkEventData;
}

export interface LarkEventData {
  /** Event type */
  type: string;

  /** Message source */
  source: {
    type: string;
  };

  /** Sender info */
  sender: {
    sender_id: {
      open_id: string;
      union_id?: string;
      user_id?: string;
    };
    sender_type: string;
    tenant_key: string;
  };

  /** Message content */
  message?: {
    message_id: string;
    root_id: string;
    parent_id: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    create_time: string;
    deleted: boolean;
    updated: boolean;
  };

  /** Additional fields */
  [key: string]: unknown;
}

export interface LarkMessageContent {
  /** Text content (for msg_type='text') or Markdown content (for msg_type='markdown') */
  text?: string;

  /** Title for markdown messages */
  title?: string;

  /** Post content for rich text */
  post?: LarkPostContent;

  /** Interactive card content */
  card?: LarkCardContent;

  /** Additional fields */
  [key: string]: unknown;
}

export interface LarkPostContent {
  zh_cn?: LarkPostElement[];
  en_us?: LarkPostElement[];
}

export interface LarkPostElement {
  tag: string;
  text?: string;
  [key: string]: unknown;
}

export interface LarkCardContent {
  config?: {
    wide_screen_mode?: boolean;
  };
  header?: {
    title?: LarkCardContentText;
    subtitle?: LarkCardContentText;
  };
  elements?: LarkCardElement[];
}

export interface LarkCardContentText {
  tag: 'plain_text' | 'lark_md';
  content: string;
}

export interface LarkCardElement {
  tag: string;
  [key: string]: unknown;
}

export interface LarkSendMessageOptions {
  /** Receive ID type (open_id, user_id, union_id, chat_id) */
  receiveIdType: 'open_id' | 'user_id' | 'union_id' | 'chat_id';

  /** Message type (text, post, interactive) */
  msgType: 'text' | 'post' | 'interactive';

  /** Message content */
  content: Record<string, unknown>;

  /** UUID for idempotency (optional) */
  uuid?: string;
}

export interface LarkUser {
  open_id: string;
  union_id?: string;
  user_id?: string;
  name?: string;
  avatar_url?: string;
}

export interface LarkResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

export interface LarkUserInfoResponse {
  user: LarkUser;
}

export interface LarkSendMessageResponse {
  msg_id: string;
  create_time: string;
}
