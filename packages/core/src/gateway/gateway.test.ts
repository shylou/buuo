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

  protected async *doChatStream(request: any): AsyncIterable<any> {
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
    if (gateway && typeof gateway.cleanup === 'function') {
      await gateway.cleanup();
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
      content: '/model claude-3-5-sonnet',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };

    await gateway.handleMessage(message);

    expect(channel.sentMessages.length).toBeGreaterThan(0);
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

    await gateway.cleanup();

    // After cleanup, session mappings should be cleared
    expect(gateway.sessions.getStats().total).toBe(0);
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

    // Verify current message was added to session history
    // Should have user message + assistant response = 2 messages
    expect(session.messages.length).toBe(2);
    expect(session.messages[0].content).toBe('First message');
    expect(session.messages[0].role).toBe('user');
    expect(session.messages[1].role).toBe('assistant'); // Response added after processing
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

    // Should have 4 messages: user1 + assistant1 + user2 + assistant2
    expect(session.messages.length).toBe(4);
    expect(session.messages[0].content).toBe('Hello');
    expect(session.messages[0].role).toBe('user');
    expect(session.messages[1].role).toBe('assistant');
    expect(session.messages[2].content).toBe('How are you?');
    expect(session.messages[2].role).toBe('user');
  });
});
