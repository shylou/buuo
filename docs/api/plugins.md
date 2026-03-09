# Plugin API Documentation

Buuo plugin system provides extensibility for channels, providers, skills, and authentication.

---

## Plugin Interface

### `Plugin`

Base interface for all plugins.

```typescript
interface Plugin {
  /** Plugin ID */
  id: string;

  /** Plugin name */
  name: string;

  /** Plugin version */
  version: string;

  /** Plugin description */
  description: string;

  /** Plugin type */
  type: 'channel' | 'provider' | 'skill' | 'auth';

  /** Initialize plugin */
  initialize(context: PluginContext): Promise<void>;

  /** Start plugin */
  start(): Promise<void>;

  /** Stop plugin */
  stop(): Promise<void>;
}
```

### `PluginContext`

Context passed during plugin initialization.

```typescript
interface PluginContext {
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
```

---

## Plugin Types

### Channel Plugin (`ChannelPlugin`)

```typescript
interface ChannelPlugin extends Plugin {
  type: 'channel';

  /** Create channel instance */
  createChannel(config: ChannelPluginConfig): Channel;

  /** Get configuration schema */
  getConfigSchema?(): JSONSchema;

  /** Validate configuration */
  validateConfig?(config: unknown): ValidationResult;
}
```

### Provider Plugin (`ProviderPlugin`)

```typescript
interface ProviderPlugin extends Plugin {
  type: 'provider';

  /** Create provider instance */
  createProvider(config: ProviderPluginConfig): AIProvider;
}
```

### Skill Plugin (`SkillPlugin`)

```typescript
interface SkillPlugin extends Plugin {
  type: 'skill';

  /** Skill definitions */
  skills: SkillDefinition[];

  /** Execute skill */
  executeSkill(skillId: string, input: unknown): Promise<unknown>;
}
```

### Authentication Plugin (`AuthPlugin`)

```typescript
interface AuthPlugin extends Plugin {
  type: 'auth';

  /** Authenticate user */
  authenticate(userId: string, credentials: unknown): Promise<AuthResult>;

  /** Authorize action */
  authorize(userId: string, action: string, resource: string): Promise<boolean>;

  /** Get user info */
  getUserInfo(userId: string): Promise<UserInfo | null>;
}
```

---

## Creating Plugins

### Channel Plugin Example

```typescript
import type { ChannelPlugin, PluginContext } from '@buuo/core';
import { MyChannel } from './my-channel';

export class MyChannelPlugin implements ChannelPlugin {
  id = 'my-channel-plugin';
  name = 'My Channel Plugin';
  version = '1.0.0';
  description = 'A custom messaging channel';
  type = 'channel' as const;

  private context?: PluginContext;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.info('MyChannelPlugin initialized');
  }

  async start(): Promise<void> {
    this.context?.logger.info('MyChannelPlugin started');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('MyChannelPlugin stopped');
  }

  createChannel(config: ChannelPluginConfig): Channel {
    return new MyChannel({ id: config.token });
  }
}

// Export plugin
export const plugin = new MyChannelPlugin();
```

---

## Plugin Configuration Schema

### JSONSchema Example

```typescript
getConfigSchema(): JSONSchema {
  return {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        title: 'API Token',
        description: 'Your API token for this service'
      },
      enabled: {
        type: 'boolean',
        title: 'Enable',
        default: true
      }
    },
    required: ['token']
  };
}
```

---

## Plugin Loading

### Auto Loading

Plugins are automatically loaded from:

1. `packages/channel-*/index.ts`
2. `packages/provider-*/index.ts`
3. `plugins/*/index.ts`

### Manual Loading

```typescript
import { PluginManager } from '@buuo/core';

const manager = new PluginManager({
  gateway: myGateway,
  config: myConfig
});

// Load plugin
await manager.load('./path/to/plugin');

// Start all plugins
await manager.startAll();
```

---

## Related Documentation

- [Channels API](./channels.md)
- [Providers API](./providers.md)
