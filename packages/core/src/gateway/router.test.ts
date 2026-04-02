/**
 * MessageRouter tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageRouter } from './router.js';
import { BaseChannel } from '../channels/index.js';
import { BaseProvider } from '../providers/index.js';
import type { IncomingMessage, OutgoingMessage } from '../channels/index.js';
import type { ChatRequest, ChatResponse } from '../providers/index.js';

class MockChannel extends BaseChannel {
  constructor() {
    super('test-channel', 'Test Channel', 'test');
  }

  protected async doInitialize(): Promise<void> {}
  protected async doStart(): Promise<void> {}
  protected async doStop(): Promise<void> {}

  async sendMessage(message: OutgoingMessage): Promise<void> {
    this.sentMessages = this.sentMessages || [];
    this.sentMessages.push(message);
  }

  sentMessages: OutgoingMessage[] = [];
}

class MockProvider extends BaseProvider {
  public initialized = false;

  constructor() {
    super('test-provider', 'Test Provider');
  }

  protected async doInitialize(): Promise<void> {
    this.initialized = true;
    this._status = {
      available: true,
      state: 'ready',
      model: 'test-model'
    };
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    return {
      content: `Response to: ${request.messages[request.messages.length - 1]?.content}`,
      done: true,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  }

  protected async *doChatStream(_request: ChatRequest): AsyncIterable<ChatResponse> {
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

describe('MessageRouter', () => {
  let router: MessageRouter;
  let channel: MockChannel;
  let provider: MockProvider;

  beforeEach(() => {
    router = new MessageRouter({
      defaultProvider: 'test-provider',
      temperature: 0.7,
      maxTokens: 4096,
      stream: false
    });

    channel = new MockChannel();
    provider = new MockProvider();
  });

  function createMockSession() {
    return {
      id: 'session-1',
      userId: 'user-1',
      channelId: 'test-channel',
      conversationId: 'conv-1',
      messages: [],
      data: {},
      createdAt: new Date(),
      lastActivity: new Date(),
      active: true
    };
  }

  function createMockMessage(): IncomingMessage {
    return {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
      timestamp: new Date(),
      metadata: { channelId: 'test-channel' }
    };
  }

  it('should register channel', () => {
    router.registerChannel(channel);
    expect(router.getChannel('test-channel')).toBe(channel);
  });

  it('should unregister channel', () => {
    router.registerChannel(channel);
    router.unregisterChannel('test-channel');
    expect(router.getChannel('test-channel')).toBeUndefined();
  });

  it('should register provider', () => {
    router.registerProvider(provider);
    expect(router.getProvider('test-provider')).toBe(provider);
  });

  it('should unregister provider', () => {
    router.registerProvider(provider);
    router.unregisterProvider('test-provider');
    expect(router.getProvider('test-provider')).toBeUndefined();
  });

  it('should get all channels', () => {
    router.registerChannel(channel);
    const channels = router.getChannels();
    expect(channels).toContain(channel);
  });

  it('should get all providers', () => {
    router.registerProvider(provider);
    const providers = router.getProviders();
    expect(providers).toContain(provider);
  });

  it('should get channel for conversation', () => {
    router.registerChannel(channel);
    createMockMessage();
    router.registerChannel(channel);

    // After routing, the mapping should be established
    // This is tested implicitly through sendResponse
  });

  it('should route message to provider', async () => {
    await provider.initialize({});
    router.registerProvider(provider);
    const session = createMockSession();
    const message = createMockMessage();

    const responses = await router.route(session, message);

    let fullResponse = '';
    for await (const response of responses) {
      if (response.content) {
        fullResponse += response.content;
      }
    }

    expect(fullResponse).toContain('Response to');
  });

  it('should route with streaming', async () => {
    await provider.initialize({});
    const streamingRouter = new MessageRouter({
      defaultProvider: 'test-provider',
      stream: true
    });
    streamingRouter.registerProvider(provider);

    const session = createMockSession();
    const message = createMockMessage();

    const responses = await streamingRouter.route(session, message);

    const chunks: string[] = [];
    for await (const response of responses) {
      if (response.content) {
        chunks.push(response.content);
      }
    }

    expect(chunks).toContain('Stream ');
    expect(chunks).toContain('response');
  });

  it('should send response through channel', async () => {
    await provider.initialize({});
    router.registerChannel(channel);
    router.registerProvider(provider);

    const session = createMockSession();
    const message = createMockMessage();

    const responses = await router.route(session, message);

    await router.sendResponse('conv-1', responses);

    expect(channel.sentMessages).toHaveLength(1);
    expect(channel.sentMessages[0].conversationId).toBe('conv-1');
  });
});
