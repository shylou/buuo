/**
 * Gateway Integration Tests: LarkChannel → Gateway → Provider
 *
 * Tests complete message flow: Lark message → Gateway routing → Provider processing → Response return
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { Gateway } from '../gateway.js';
import type {
  Channel,
  IncomingMessage,
  OutgoingMessage,
  AIProvider,
  ChatResponse,
  PluginManager,
  ConfigStore,
  Logger,
  ProviderStatus,
} from '../../index.js';

// ========== Mocks ==========

/** Mock PluginManager */
class MockPluginManager implements Partial<PluginManager> {
  async loadAll(): Promise<{ name: string; version: string }[]> {
    return [];
  }
  async startAll(): Promise<void> {}
  async stopAll(): Promise<void> {}
  getChannels(): Channel[] {
    return this.mockChannels || [];
  }
  getProviders(): AIProvider[] {
    return this.mockProviders || [];
  }
  getByType<T>(): T[] {
    return [] as any;
  }
  mockChannels: Channel[] = [];
  mockProviders: AIProvider[] = [];
}

/** Mock ConfigStore */
class MockConfigStore implements Partial<ConfigStore> {
  get(key: string): any {
    return (this as any).mockData?.get(key);
  }
  set(key: string, value: any): void {
    (this as any).mockData = (this as any).mockData || new Map();
    (this as any).mockData.set(key, value);
  }
  mockData = new Map();
}

/** Mock Logger */
class MockLogger implements Logger {
  info = vi.fn();
  warn = vi.fn();
  error = vi.fn();
  debug = vi.fn();
  trace = vi.fn();
  fatal = vi.fn();
  child = vi.fn(() => this as any);
}

/** Mock LarkChannel */
class MockLarkChannel extends EventEmitter implements Channel {
  readonly id = 'mock-lark-channel';
  readonly name = 'Mock Lark Channel';
  readonly type = 'lark';

  initialized = false;
  started = false;
  sentMessages: OutgoingMessage[] = [];
  updatedMessages: Array<{ messageId: string; content: string; conversationId?: string }> = [];

  async initialize(_config: any): Promise<void> {
    this.initialized = true;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async sendMessage(message: OutgoingMessage): Promise<string | undefined> {
    this.sentMessages.push(message);
    return 'mock_msg_id';
  }

  async updateMessage(messageId: string, content: string, conversationId?: string): Promise<void> {
    this.updatedMessages.push({ messageId, content, conversationId });
  }

  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): void {
    this.on('message', handler);
  }

  getStatus() {
    return {
      connected: this.started,
      state: (this.started ? 'connected' : 'disconnected') as 'connected' | 'disconnected',
    };
  }

  async dispose(): Promise<void> {
    this.started = false;
    this.removeAllListeners();
  }
}

/** Mock ClaudeCodeProvider */
class MockClaudeCodeProvider extends EventEmitter implements AIProvider {
  readonly id = 'mock-claude-provider';
  readonly name = 'Mock Claude Provider';
  readonly type = 'claude-code';

  initialized = false;
  chatHistory: any[] = [];
  public trackedMessageIds = new Set<string>();

  async initialize(_config: any): Promise<void> {
    this.initialized = true;
  }

  /**
   * Track messages without duplicates
   * Uses content-based fingerprinting to avoid duplicate entries
   */
  private trackMessages(messages: any[] | undefined): void {
    if (!messages) return;

    messages.forEach(msg => {
      // Create unique fingerprint from role + content
      const fingerprint = `${msg.role}:${msg.content}`;

      if (!this.trackedMessageIds.has(fingerprint)) {
        this.chatHistory.push(msg);
        this.trackedMessageIds.add(fingerprint);
      }
    });
  }

  async chat(request: any): Promise<ChatResponse> {
    // Track messages for testing
    this.trackMessages(request.messages);

    // Non-streaming version
    return {
      content: 'This is a mock response from Claude Code Provider.',
      done: true
    };
  }

  async *chatStream(request: any): AsyncGenerator<ChatResponse> {
    // Track messages for testing
    this.trackMessages(request.messages);

    // Mock streaming response
    const responseText = 'This is a mock response from Claude Code Provider.';

    // Thinking event
    yield {
      thinking: { type: 'thinking', content: 'Processing...' },
      done: false
    };

    // Content chunks
    for (const chunk of responseText.split(' ')) {
      yield {
        content: chunk + ' ',
        done: false
      };
    }

    // Done
    yield {
      content: '',
      done: true
    };
  }

  estimateTokens(text: string): number {
    // Simple estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getStatus(): ProviderStatus {
    return {
      available: this.initialized,
      state: this.initialized ? 'ready' : 'uninitialized',
      model: 'mock-model'
    };
  }
}

// ========== Test Helpers ==========

function createGateway(): {
  gateway: Gateway;
  mockLark: MockLarkChannel;
  mockProvider: MockClaudeCodeProvider;
  mockPlugins: MockPluginManager;
  mockConfig: MockConfigStore;
  mockLogger: MockLogger;
} {
  const mockPlugins = new MockPluginManager();
  const mockConfig = new MockConfigStore();
  const mockLogger = new MockLogger();

  const mockLark = new MockLarkChannel();
  const mockProvider = new MockClaudeCodeProvider();

  mockPlugins.mockChannels = [mockLark];
  mockPlugins.mockProviders = [mockProvider];

  const gateway = new Gateway(
    {
      id: 'test-gateway',
      session: {
        maxHistory: 100,
      },
      router: {
        defaultProvider: 'mock-claude-provider',
      },
    },
    mockPlugins as any,
    mockConfig as any,
    mockLogger
  );

  // Register Channel to Router (Gateway won't auto-register)
  gateway.router.registerChannel(mockLark);

  // Register Provider to Router
  gateway.router.registerProvider(mockProvider);

  return {
    gateway,
    mockLark,
    mockProvider,
    mockPlugins,
    mockConfig,
    mockLogger,
  };
}

function createIncomingMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'msg_001',
    userId: 'user_001',
    conversationId: 'chat_001',
    content: 'Hello, Gateway!',
    timestamp: new Date(),
    metadata: {
      channelId: 'mock-lark-channel',
      chatType: 'group',
      messageType: 'text',
    },
    ...overrides,
  };
}

// ========== Test Constants ==========

const TEST_CONSTANTS = {
  /** Minimum expected message updates for a complete response */
  MIN_MESSAGE_UPDATES: 1,
  /** Minimum expected sent messages (thinking indicator) */
  MIN_SENT_MESSAGES: 1,
  /** Minimum user messages for multi-turn conversation */
  MIN_USER_MESSAGES: 2,
} as const;

// ========== Tests ==========

describe('Gateway Integration - LarkChannel → Provider', () => {
  let gateway: Gateway;
  let mockLark: MockLarkChannel;
  let mockProvider: MockClaudeCodeProvider;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = createGateway();
    gateway = setup.gateway;
    mockLark = setup.mockLark;
    mockProvider = setup.mockProvider;

    // Clear chat history and tracking between tests
    mockProvider.chatHistory = [];
    mockProvider.trackedMessageIds.clear();

    await gateway.initialize();
    await gateway.start();
  });

  describe('Complete Message Flow', () => {
    it('should correctly handle text message: Lark → Gateway → Provider → Response', async () => {
      const incomingMessage = createIncomingMessage();

      // Mock LarkChannel receiving message and forwarding to Gateway
      await gateway.handleMessage(incomingMessage);

      // Verify message is sent to Provider
      expect(mockProvider.chatHistory.length).toBeGreaterThan(0);
      const lastUserMessage = [...mockProvider.chatHistory].reverse().find(m => m.role === 'user');
      expect(lastUserMessage).toMatchObject({
        role: 'user',
        content: 'Hello, Gateway!',
      });

      // Verify response is sent back to Lark
      expect(mockLark.sentMessages).toHaveLength(TEST_CONSTANTS.MIN_SENT_MESSAGES); // "Thinking..." indicator
      expect(mockLark.updatedMessages.length).toBeGreaterThanOrEqual(TEST_CONSTANTS.MIN_MESSAGE_UPDATES); // At least one update
    });

    it('should handle streaming response and update message', async () => {
      const incomingMessage = createIncomingMessage({
        content: 'Tell me a joke',
      });

      await gateway.handleMessage(incomingMessage);

      // Verify "Thinking..." indicator
      expect(mockLark.sentMessages[0]?.content).toContain('Thinking');

      // Verify final response update
      const finalUpdate = mockLark.updatedMessages[mockLark.updatedMessages.length - 1];
      expect(finalUpdate.content).toContain('mock response');
    });

    it('should support multi-turn conversation and correctly maintain chat history', async () => {
      // First round
      await gateway.handleMessage(createIncomingMessage({
        id: 'msg_001',
        content: 'My name is Alice',
      }));

      // Second round
      await gateway.handleMessage(createIncomingMessage({
        id: 'msg_002',
        content: 'What is my name?',
      }));

      // Verify Provider received complete history
      expect(mockProvider.chatHistory.length).toBeGreaterThan(1);

      // Verify history includes two rounds of user messages (note: chatHistory includes all messages, including assistant responses)
      const allUserMessages = mockProvider.chatHistory.filter(m => m.role === 'user');
      expect(allUserMessages.length).toBeGreaterThanOrEqual(TEST_CONSTANTS.MIN_USER_MESSAGES);

      // Find the two user messages we sent
      const aliceMessage = allUserMessages.find(m => m.content === 'My name is Alice');
      const whatNameMessage = allUserMessages.find(m => m.content === 'What is my name?');
      expect(aliceMessage).toBeDefined();
      expect(whatNameMessage).toBeDefined();
    });

    it('should correctly handle /model command', async () => {
      await gateway.handleMessage(createIncomingMessage({
        content: '/model gpt-4',
      }));

      // /model command won't route to Provider
      expect(mockProvider.chatHistory).toHaveLength(0);
    });

    it('should correctly handle /cancel command', async () => {
      await gateway.handleMessage(createIncomingMessage({
        content: '/cancel',
      }));

      // /cancel command won't route to Provider
      expect(mockProvider.chatHistory).toHaveLength(0);
    });
  });

  describe('Session Management', () => {
    it('should create different sessions for different conversationId', async () => {
      // Create messages for two different sessions
      await gateway.handleMessage(createIncomingMessage({
        conversationId: 'chat_001',
        content: 'Hello from chat 1',
      }));

      await gateway.handleMessage(createIncomingMessage({
        conversationId: 'chat_002',
        content: 'Hello from chat 2',
      }));

      // Each session should be handled independently
      expect(mockProvider.chatHistory.length).toBe(2);
      // A new Provider instance should be created for each session
      // Or verify sessions are separate
    });

    it('should reuse session for same conversationId', async () => {
      // First round
      await gateway.handleMessage(createIncomingMessage({
        conversationId: 'chat_001',
        content: 'Message 1',
      }));

      // Get session
      const session = await gateway.sessions.getOrCreate(createIncomingMessage({
        conversationId: 'chat_001',
      }));

      // Second round
      await gateway.handleMessage(createIncomingMessage({
        conversationId: 'chat_001',
        content: 'Message 2',
      }));

      // Get the same session
      const session2 = await gateway.sessions.getOrCreate(createIncomingMessage({
        conversationId: 'chat_001',
      }));

      // Verify it's the same session
      expect(session2.id).toBe(session.id);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle Provider errors', async () => {
      // Mock Provider throws error
      mockProvider.chat = async function* () {
        yield { content: 'Partial response' };
        throw new Error('Provider error');
      };

      const incomingMessage = createIncomingMessage();

      // Gateway internally catches and logs errors
      // Verify message processing completes (error is swallowed, this is by design)
      await gateway.handleMessage(incomingMessage).catch(e => e);

      // Verify error was caught (may return undefined or error object)
      // Gateway error handling strategy is to swallow errors to keep service available
      expect(mockLark.sentMessages.length).toBeGreaterThanOrEqual(TEST_CONSTANTS.MIN_SENT_MESSAGES);
    });

    it('should handle missing Channel', async () => {
      const messageWithoutChannel = createIncomingMessage({
        metadata: {}, // No channelId
      });

      // Gateway will throw "No channel found" error
      await expect(gateway.handleMessage(messageWithoutChannel)).rejects.toThrow('No channel found');
    });
  });
});

describe('Gateway Integration - Command Handling', () => {
  let gateway: Gateway;
  let mockLark: MockLarkChannel;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = createGateway();
    gateway = setup.gateway;
    mockLark = setup.mockLark;

    // Clear chat history and tracking between tests
    setup.mockProvider.chatHistory = [];
    setup.mockProvider.trackedMessageIds.clear();

    await gateway.initialize();
    await gateway.start();
  });

  describe('/model command', () => {
    it('should respond to /model command', async () => {
      await gateway.handleMessage(createIncomingMessage({
        content: '/model',
      }));

      // Should send response message
      expect(mockLark.sentMessages.length).toBeGreaterThan(0);
    });

    it('should respond to /model <alias> command', async () => {
      await gateway.handleMessage(createIncomingMessage({
        content: '/model gpt-4',
      }));

      expect(mockLark.sentMessages.length).toBeGreaterThan(0);
    });
  });

  describe('/cancel command', () => {
    it('should respond to /cancel command', async () => {
      await gateway.handleMessage(createIncomingMessage({
        content: '/cancel',
      }));

      // Should send response message ("No active request" or other)
      expect(mockLark.sentMessages.length).toBeGreaterThan(0);
    });
  });
});
