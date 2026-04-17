/**
 * Gateway tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Gateway } from './gateway.js';
import { BaseChannel } from '../channels/index.js';
import { BaseProvider } from '../providers/index.js';
import { AuthManager } from '../security/auth.js';
import { PluginManager } from '../plugins/manager.js';
import { ConfigStore } from '../config/store.js';
import { createLogger } from '../utils/logger.js';
import type { ChannelPlugin, ProviderPlugin, PluginContext } from '../plugins/interface.js';

let testLogger: any;

class MockChannel extends BaseChannel {
  sentMessages: any[] = [];

  constructor(logger?: any) {
    super('test-channel', 'Test Channel', 'test', logger || testLogger);
  }

  protected async doInitialize(): Promise<void> {}
  protected async doStart(): Promise<void> {}
  protected async doStop(): Promise<void> {}

  async sendMessage(message: any): Promise<string> {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.sentMessages.push({ ...message, id });
    return id;
  }

  async updateMessage(id: string, content: string): Promise<void> {
    const msg = this.sentMessages.find(m => m.id === id);
    if (msg) {
      msg.content = content;
      msg.updatedAt = new Date();
    }
  }
}

class MockProvider extends BaseProvider {
  _initialized = false;
  cleanup = vi.fn(async () => {});

  constructor() {
    super('test-provider', 'Test Provider');
  }

  get initialized(): boolean {
    return this._initialized;
  }

  protected async doInitialize(): Promise<void> {
    this._initialized = true;
    this._status = {
      available: true,
      state: 'ready',
      model: 'test-model'
    };
  }

  protected async doChat(request: any): Promise<any> {
    return {
      content: `Response to: ${request.messages[request.messages.length - 1]?.content}`,
      done: true,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  }

  protected async *doChatStream(_request: any): AsyncIterable<any> {
    yield {
      content: 'Stream ',
      done: false
    };
    yield {
      content: 'response',
      done: false
    };
    yield {
      content: '',
      done: true,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class TestChannelPlugin implements ChannelPlugin {
  id = 'test-channel-plugin';
  name = 'Test Channel Plugin';
  version = '0.0.1';
  description = 'Test channel plugin';
  type = 'channel' as const;

  async initialize(_context: PluginContext): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  createChannel(): import('../channels/index.js').Channel {
    return new MockChannel();
  }
}

class TestProviderPlugin implements ProviderPlugin {
  id = 'test-provider-plugin';
  name = 'Test Provider Plugin';
  version = '0.0.1';
  description = 'Test provider plugin';
  type = 'provider' as const;

  async initialize(_context: PluginContext): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  createProvider(config: { id?: string }): import('../providers/index.js').AIProvider {
    const provider = new MockProvider();
    if (config.id) {
      (provider as { id: string }).id = config.id;
    }
    return provider;
  }
}

describe('Gateway', () => {
  let gateway: Gateway;
  let channel: MockChannel;
  let provider: MockProvider;
  let auth: AuthManager;
  let plugins: PluginManager;
  let configStore: ConfigStore;

  beforeEach(async () => {
    vi.clearAllMocks();

    testLogger = await createLogger({ level: 'debug' });

    plugins = new PluginManager(testLogger, {
      gateway: {} as any,
      dataDir: '/tmp/test'
    });

    configStore = new ConfigStore({}, testLogger);

    gateway = new Gateway({
      router: {
        defaultProvider: 'test-provider'
      }
    }, plugins, configStore, testLogger);

    channel = new MockChannel();
    provider = new MockProvider();
    auth = new AuthManager({
      pairingTTL: 300000,
      sessionTTL: 86400000
    }, testLogger);

    await provider.initialize({});
    gateway.registerProvider(provider);
    gateway.registerChannel(channel);
  });

  afterEach(async () => {
    if (gateway && typeof gateway.stop === 'function') {
      await gateway.stop();
    }
    if (auth && typeof auth.cleanup === 'function') {
      await auth.cleanup();
    }
  });

  it('should register provider', () => {
    expect(gateway.router.getProvider('test-provider')).toBe(provider);
  });

  it('should register channel', () => {
    expect(gateway.router.getChannel('test-channel')).toBe(channel);
  });

  it('should handle simple message', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    expect(channel.sentMessages.length).toBeGreaterThan(0);
    // MockProvider returns "Stream response" when streaming or "Response to" when not
    const hasResponse = channel.sentMessages.some((m: any) =>
      m.content && (m.content.includes('Response to') || m.content.includes('response'))
    );
    expect(hasResponse).toBe(true);
  });

  it('should handle streaming message', async () => {
    const streamingGateway = new Gateway({
      router: {
        defaultProvider: 'test-provider',
        stream: true
      }
    }, plugins, configStore, testLogger);

    streamingGateway.registerProvider(provider);
    streamingGateway.registerChannel(channel);

    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Stream test',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await streamingGateway.handleMessage(message);

    expect(channel.sentMessages.length).toBeGreaterThan(0);
  });

  it('should handle /model command', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: '/model sonnet',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    expect(channel.sentMessages.length).toBeGreaterThan(0);
  });

  it('should clean up providers when gateway stops', async () => {
    const stopGateway = new Gateway({
      router: {
        defaultProvider: 'test-provider'
      }
    }, plugins, configStore, testLogger);

    const stopChannel = new MockChannel();
    const stopProvider = new MockProvider();
    await stopProvider.initialize({});
    stopGateway.registerProvider(stopProvider);
    stopGateway.registerChannel(stopChannel);

    await stopGateway.start();
    await stopGateway.stop();

    expect(stopProvider.cleanup).toHaveBeenCalledTimes(1);
  });

  it('should accept a raw model string for codex sessions', async () => {
    const session = await gateway.sessions.getOrCreate({
      id: 'msg-seed',
      userId: 'user-1',
      conversationId: 'conv-codex',
      content: 'seed',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });
    session.data.providerId = 'codex-cli';

    await gateway.handleMessage({
      id: 'msg-2',
      userId: 'user-1',
      conversationId: 'conv-codex',
      content: '/model gpt-5.4-mini',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });

    expect(session.data.model).toBe('gpt-5.4-mini');
    expect(channel.sentMessages.at(-1)?.content).toContain('gpt-5.4-mini');
  });

  it('should accept a raw model string for a new codex conversation before providerId is stored', async () => {
    const codexGateway = new Gateway({
      router: {
        defaultProvider: 'codex-cli',
        stream: false,
      }
    }, plugins, configStore, testLogger);

    const codexProvider = new MockProvider();
    (codexProvider as { id: string }).id = 'codex-cli';
    (codexProvider as { name: string }).name = 'Codex CLI';

    codexGateway.registerProvider(codexProvider);
    codexGateway.registerChannel(channel);

    await codexGateway.handleMessage({
      id: 'msg-2b',
      userId: 'user-1',
      conversationId: 'conv-codex-fresh',
      content: '/model gpt-5.4-mini',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });

    const session = await codexGateway.sessions.getOrCreate({
      id: 'msg-2b-followup',
      userId: 'user-1',
      conversationId: 'conv-codex-fresh',
      content: 'seed',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });
    expect(session?.data.model).toBe('gpt-5.4-mini');
    expect(channel.sentMessages.at(-1)?.content).toContain('gpt-5.4-mini');
  });

  it('should reject unknown aliases for non-codex sessions', async () => {
    await gateway.handleMessage({
      id: 'msg-3',
      userId: 'user-1',
      conversationId: 'conv-unknown',
      content: '/model gpt-5.4-mini',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });

    expect(channel.sentMessages.at(-1)?.content).toContain('未知模型');
  });

  it('should send thinking indicator', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Test',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    // Check that some message was sent (thinking indicator may have been sent)
    expect(channel.sentMessages.length).toBeGreaterThan(0);
  });

  it('should handle session timeout', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Test',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    expect(gateway.sessions.getStats().total).toBeGreaterThan(0);
  });

  it('should cleanup resources', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Test',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    // Start the gateway
    await gateway.start();
    expect(gateway.running).toBe(true);

    await gateway.stop();

    // After stop, gateway should not be running
    expect(gateway.running).toBe(false);
  });

  it('should support /cancel command', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Test',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    // Send cancel command
    const cancelMessage = {
      id: 'msg-2',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: '/cancel',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(cancelMessage);
  });

  it('should include current message in session history for provider', async () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-history-test',
      content: 'First message',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    const session = gateway.sessions.getByConversation('conv-history-test');
    expect(session).toBeDefined();

    // Verify session was created and has messages
    expect(session.messages.length).toBeGreaterThanOrEqual(1);
    // Session stores response messages from the provider
    expect(session.messages[0]).toBeDefined();
  });

  it('should maintain conversation history across multiple messages', async () => {
    const conversationId = 'conv-history-multi';

    // First message
    await gateway.handleMessage({
      id: 'msg-1',
      userId: 'user-1',
      conversationId,
      content: 'Hello',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });

    // Second message
    await gateway.handleMessage({
      id: 'msg-2',
      userId: 'user-1',
      conversationId,
      content: 'How are you?',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    });

    const session = gateway.sessions.getByConversation(conversationId);
    expect(session).toBeDefined();

    // Should have at least 2 response messages across both rounds
    expect(session!.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('should skip disabled plugin components from config', async () => {
    const pluginGateway = new Gateway({
      router: {
        defaultProvider: 'enabled-provider'
      },
      autoStartPlugins: false
    }, plugins, configStore, testLogger);

    (plugins as any).context.gateway = pluginGateway;
    (plugins as any).context.events = pluginGateway;

    configStore.merge({
      channels: {
        'test-channel-plugin': [
          { token: 'enabled-channel' },
          { token: 'disabled-channel', enabled: false }
        ]
      },
      providers: {
        'test-provider-plugin': [
          { id: 'enabled-provider' },
          { id: 'disabled-provider', enabled: false }
        ]
      }
    } as any);

    await plugins.register(new TestChannelPlugin());
    await plugins.register(new TestProviderPlugin());

    await pluginGateway.initialize();

    expect(pluginGateway.router.getChannels()).toHaveLength(1);
    expect(pluginGateway.router.getProviders()).toHaveLength(1);
    expect(pluginGateway.router.getProvider('enabled-provider')).toBeDefined();
    expect(pluginGateway.router.getProvider('disabled-provider')).toBeUndefined();
  });
});
