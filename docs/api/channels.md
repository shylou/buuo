# Channel API Documentation

Buuo channel system provides unified message send/receive interfaces supporting multi-platform integration.

---

## Channel Interface

### `Channel`

Base interface that all channels must implement.

```typescript
interface Channel {
  /** Unique channel identifier */
  id: string;

  /** Channel name */
  name: string;

  /** Channel type */
  type: string;

  /** Initialize channel */
  initialize(config: ChannelConfig): Promise<void>;

  /** Start channel */
  start(): Promise<void>;

  /** Stop channel */
  stop(): Promise<void>;

  /** Send message */
  sendMessage(message: OutgoingMessage): Promise<void>;

  /** Subscribe to message events */
  onMessage(handler: MessageHandler): void;

  /** Get channel status */
  getStatus(): ChannelStatus;

  /** Clean up resources */
  dispose(): Promise<void>;
}
```

---

## Message Types

### `IncomingMessage`

Incoming message structure:

```typescript
interface IncomingMessage {
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
```

### `OutgoingMessage`

Outgoing message structure:

```typescript
interface OutgoingMessage {
  /** Target conversation ID */
  conversationId: string;

  /** Message content */
  content: string;

  /** Attachments */
  attachments?: Attachment[];

  /** Message options */
  options?: MessageOptions;
}
```

---

## Channel Configuration

### `ChannelConfig`

```typescript
interface ChannelConfig {
  /** Authentication token */
  token?: string;

  /** Webhook URL */
  webhookUrl?: string;

  /** Custom configuration */
  options?: Record<string, unknown>;
}
```

---

## Built-in Channels

### Lark/Feishu Channel

```typescript
import { LarkChannel } from '@buuo/channel-lark';

const channel = new LarkChannel({
  id: 'lark-main'
});

await channel.initialize({
  token: process.env.LARK_APP_ID,
  options: {
    appSecret: process.env.LARK_APP_SECRET
  }
});

await channel.start();
```

---

## Creating Custom Channels

```typescript
import type { Channel } from '@buuo/core';

export class MyChannel implements Channel {
  id = 'my-channel';
  name = 'My Custom Channel';
  type = 'custom';

  async initialize(config: ChannelConfig): Promise<void> {
    // Initialize logic
  }

  async start(): Promise<void> {
    // Start logic
  }

  async stop(): Promise<void> {
    // Stop logic
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    // Send message logic
  }

  onMessage(handler: MessageHandler): void {
    // Subscribe message logic
  }

  getStatus(): ChannelStatus {
    return {
      connected: true,
      state: 'connected'
    };
  }

  async dispose(): Promise<void> {
    // Clean up resources
  }
}
```

---

## Channel Status

```typescript
interface ChannelStatus {
  /** Is connected */
  connected: boolean;

  /** Connection state */
  state: 'disconnected' | 'connecting' | 'connected' | 'error';

  /** Error message */
  error?: string;

  /** Connection timestamp */
  connectedAt?: Date;

  /** Additional information */
  info?: Record<string, unknown>;
}
```

---

## Event Handling

```typescript
// Subscribe to message events
channel.onMessage(async (message: IncomingMessage) => {
  console.log(`Received message from ${message.userId}`);
  console.log(`Content: ${message.content}`);

  // Process message...
});
```

---

## Related Documentation

- [Providers API](./providers.md)
- [Plugins API](./plugins.md)
