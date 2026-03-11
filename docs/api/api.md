# Buuo API Reference

## Core Package (@buuo/core)

### Gateway

#### `class Gateway`

Main gateway class that coordinates all components.

```typescript
import { Gateway, PluginManager, ConfigStore, createLogger } from '@buuo/core';

const logger = await createLogger();
const configStore = new ConfigStore({ path: 'config.yaml' });
const pluginManager = new PluginManager(logger, { /* context */ });

const gateway = new Gateway(
  { /* config */ },
  pluginManager,
  configStore,
  logger
);

await gateway.initialize();
await gateway.start();
```

**Methods:**
- `initialize(): Promise<void>` - Initialize gateway and load plugins
- `start(): Promise<void>` - Start gateway and all channels
- `stop(): Promise<void>` - Stop gateway and cleanup
- `handleMessage(message: IncomingMessage): Promise<void>` - Process incoming message
- `registerChannel(channel: Channel): void` - Register a channel
- `registerProvider(provider: AIProvider): void` - Register a provider
- `getStatus(): GatewayStatus` - Get gateway status

**Events:**
- `initialized` - Gateway initialized
- `started` - Gateway started
- `stopped` - Gateway stopped
- `message:incoming` - Message received
- `message:handled` - Message processed
- `message:error` - Message processing failed
- `channel:registered` - Channel registered
- `provider:registered` - Provider registered

### Session Manager

#### `class SessionManager`

Manages conversation sessions with message history. Sessions persist in memory until the gateway restarts.

```typescript
import { SessionManager } from '@buuo/core';

const sessions = new SessionManager({
  maxHistory: 100
});

const session = await sessions.getOrCreate(message);
sessions.addMessage(session.id, chatMessage);
```

**Methods:**
- `getOrCreate(message: IncomingMessage): Promise<Session>` - Get or create session
- `get(sessionId: string): Session | undefined` - Get session by ID
- `getByConversation(conversationId: string): Session | undefined` - Get session by conversation
- `addMessage(sessionId: string, message: ChatMessage): void` - Add message to history
- `updateData(sessionId: string, data: Record<string, unknown>): void` - Update session data
- `clearHistory(sessionId: string): void` - Clear message history
- `deactivate(sessionId: string): void` - Deactivate session
- `delete(sessionId: string): void` - Delete session
- `listActive(): Session[]` - List active sessions
- `getStats(): SessionStats` - Get session statistics

### Message Router

#### `class MessageRouter`

Routes messages between channels and providers.

```typescript
import { MessageRouter } from '@buuo/core';

const router = new MessageRouter({
  defaultProvider: 'claude',
  temperature: 0.7,
  maxTokens: 4096,
  stream: true
});

router.registerChannel(channel);
router.registerProvider(provider);

const responses = await router.route(session, message);
await router.sendResponse(conversationId, responses);
```

**Methods:**
- `registerChannel(channel: Channel): void` - Register channel
- `registerProvider(provider: AIProvider): void` - Register provider
- `getChannelForConversation(conversationId: string): Channel | undefined` - Get channel for conversation
- `route(session: Session, message: IncomingMessage): AsyncIterable<ChatResponse>` - Route message to provider
- `sendResponse(conversationId: string, responses: AsyncIterable<ChatResponse>): Promise<void>` - Send response

### Channels

#### `interface Channel`

Base interface for all channel implementations.

```typescript
interface Channel {
  id: string;
  name: string;
  type: string;

  initialize(config: ChannelConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
  getStatus(): ChannelStatus;
  dispose(): Promise<void>;
}
```

#### `class BaseChannel`

Abstract base class for channel implementations.

```typescript
import { BaseChannel } from '@buuo/core';

class MyChannel extends BaseChannel {
  constructor(id: string, name: string, type: string) {
    super(id, name, type);
  }

  protected async doInitialize(): Promise<void> {
    // Initialize channel
  }

  protected async doStart(): Promise<void> {
    // Start channel
  }

  protected async doStop(): Promise<void> {
    // Stop channel
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    // Send message
  }
}
```

### Providers

#### `interface AIProvider`

Base interface for all provider implementations.

```typescript
interface AIProvider {
  id: string;
  name: string;

  initialize(config: ProviderConfig): Promise<void>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatResponse>;
  estimateTokens(text: string): number;
  getStatus(): ProviderStatus;
}
```

#### `class BaseProvider`

Abstract base class for provider implementations.

```typescript
import { BaseProvider } from '@buuo/core';

class MyProvider extends BaseProvider {
  constructor(id: string, name: string) {
    super(id, name);
  }

  protected async doInitialize(): Promise<void> {
    // Initialize provider
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    // Handle non-streaming chat
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    // Handle streaming chat
  }

  estimateTokens(text: string): number {
    // Estimate token count
  }
}
```

### Plugin Manager

#### `class PluginManager`

Manages plugin lifecycle and registration.

```typescript
import { PluginManager } from '@buuo/core';

const manager = new PluginManager(logger, { /* context */ });

await manager.register(plugin);
await manager.loadAll();
await manager.startAll();

const pluginInfo = manager.getInfo('plugin-id');
```

**Methods:**
- `register(plugin: Plugin): Promise<void>` - Register plugin
- `loadAll(): Promise<PluginLoadResult[]>` - Load all plugins
- `load(pluginId: string): Promise<void>` - Load specific plugin
- `start(pluginId: string): Promise<void>` - Start plugin
- `startAll(): Promise<void>` - Start all plugins
- `stop(pluginId: string): Promise<void>` - Stop plugin
- `stopAll(): Promise<void>` - Stop all plugins
- `unload(pluginId: string): Promise<void>` - Unload plugin
- `getInfo(pluginId: string): PluginInfo | null` - Get plugin info
- `list(): PluginInfo[]` - List all plugins
- `get<T>(pluginId: string): T | undefined` - Get plugin instance
- `has(pluginId: string): boolean` - Check if plugin exists
- `getByType<T>(type: PluginType): T[]` - Get plugins by type

### Config Store

#### `class ConfigStore`

Manages configuration with schema validation.

```typescript
import { ConfigStore } from '@buuo/core';

const config = new ConfigStore({
  path: 'config.yaml',
  autoSave: true,
  defaults: { key: 'value' }
});

await config.load();

const value = config.get('key');
config.set('key', 'newValue');
await config.save();
```

**Methods:**
- `load(filePath?: string): Promise<void>` - Load from file
- `save(filePath?: string): Promise<void>` - Save to file
- `get<T>(key: string, defaultValue?: T): T` - Get value by key
- `set(key: string, value: ConfigValue): void` - Set value by key
- `has(key: string): boolean` - Check if key exists
- `delete(key: string): void` - Delete key
- `all(): ConfigObject` - Get all config
- `watch(callback): () => void` - Watch for changes
- `clear(): void` - Clear all config
- `merge(data: ConfigObject): void` - Merge config

### Security

#### `class AuthManager`

Manages user authentication and authorization.

```typescript
import { AuthManager } from '@buuo/core';

const auth = new AuthManager({
  pairingTTL: 300000,
  sessionTTL: 86400000,
  adminUsers: ['user123']
});

const pairingCode = await auth.generatePairingCode();
const result = await auth.validatePairingCode('CODE123', 'user456');

const hasPermission = auth.hasPermission('user456', 'channel:send');
```

**Methods:**
- `generatePairingCode(userId?: string): Promise<PairingCode>` - Generate pairing code
- `validatePairingCode(code: string, userId: string): Promise<AuthResult>` - Validate pairing code
- `isPaired(userId: string): boolean` - Check if user is paired
- `pairUser(userId: string): Promise<User>` - Pair user
- `unpairUser(userId: string): Promise<void>` - Unpair user
- `getUser(userId: string): User | undefined` - Get user
- `updateUser(userId: string, updates: Partial<User>): User | undefined` - Update user
- `hasPermission(userId: string, permission: string): boolean` - Check permission
- `grantPermission(userId: string, permission: string): void` - Grant permission
- `revokePermission(userId: string, permission: string): void` - Revoke permission
- `validateSession(token: string): { valid: boolean; userId?: string }` - Validate session
- `listUsers(): User[]` - List all users
- `getStats(): AuthStats` - Get statistics

## CLI (@buuo/cli)

### Commands

#### `buuo gateway`

Gateway management commands.

```bash
buuo gateway start [--config <path>] [--daemon]
buuo gateway status [--config <path>]
buuo gateway stop
```

#### `buuo config`

Configuration management commands.

```bash
buuo config validate [--config <path>]
buuo config get <key> [--config <path>]
buuo config set <key> <value> [--config <path>]
buuo config init [--output <path>]
```

#### `buuo plugin`

Plugin management commands.

```bash
buuo plugin list [--dir <path>]
buuo plugin info <pluginId> [--dir <path>]
buuo plugin validate <pluginPath>
```

## Plugin SDK (@buuo/plugin-sdk)

### Channel Plugin

```typescript
import { createChannelPlugin, SimpleChannel } from '@buuo/plugin-sdk';

export const plugin = createChannelPlugin({
  id: 'my-channel',
  name: 'My Channel',
  version: '1.0.0',
  description: 'My custom channel',
  createChannel: (config) => new MyChannel(config)
});
```

### Provider Plugin

```typescript
import { createProviderPlugin, SimpleProvider } from '@buuo/plugin-sdk';

export const plugin = createProviderPlugin({
  id: 'my-provider',
  name: 'My Provider',
  version: '1.0.0',
  description: 'My custom provider',
  createProvider: (config) => new MyProvider(config)
});
```

### Skill Plugin

```typescript
import { createSkillPlugin, createSkill } from '@buuo/plugin-sdk';

export const plugin = createSkillPlugin({
  id: 'my-skills',
  name: 'My Skills',
  version: '1.0.0',
  description: 'My custom skills',
  skills: [
    createSkill({
      id: 'my-skill',
      name: 'My Skill',
      description: 'Does something',
      inputSchema: {
        type: 'object',
        properties: { input: { type: 'string' } }
      },
      handler: async (input, context) => {
        return { result: 'done' };
      }
    })
  ]
});
```

## Types

### Session

```typescript
interface Session {
  id: string;
  userId: string;
  channelId: string;
  conversationId: string;
  messages: ChatMessage[];
  data: Record<string, unknown>;
  createdAt: Date;
  lastActivity: Date;
  active: boolean;
}
```

### ChatMessage

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolId?: string;
  metadata?: Record<string, unknown>;
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler?: (input: unknown) => Promise<unknown>;
}
```
