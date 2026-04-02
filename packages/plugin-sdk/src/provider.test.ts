/**
 * Provider Plugin SDK tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProviderPlugin,
  SimpleProvider,
} from './provider.js';
import type { ProviderConfig, ChatRequest, ChatResponse } from '@buuo/core/providers';
import type { PluginContext } from '@buuo/core/plugins';

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
});

// Mock plugin context
const createMockContext = (): PluginContext => ({
  gateway: {} as any,
  config: {} as any,
  logger: createMockLogger(),
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } as any,
  dataDir: '/tmp/test'
});

// Mock provider implementation
class MockProvider extends SimpleProvider {
  constructor(config: ProviderConfig) {
    super('mock-provider', 'Mock Provider', config.model || 'default');
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    return {
      content: `Mock response to: ${request.messages[0]?.content || 'empty'}`,
      done: true,
      usage: this.calculateUsage(
        request.messages[0]?.content || '',
        'Mock response'
      )
    };
  }
}

describe('createProviderPlugin', () => {
  let mockContext: PluginContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  describe('creation', () => {
    it('should create plugin with valid options', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);

      expect(plugin.id).toBe('test-provider');
      expect(plugin.name).toBe('Test Provider');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('A test provider');
      expect(plugin.type).toBe('provider');
    });

    it('should create plugin with optional author field', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        author: 'Test Author',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);

      expect(plugin.author).toBe('Test Author');
    });
  });

  describe('lifecycle', () => {
    it('should initialize plugin and cache logger', async () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);
      await plugin.initialize(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized')
      );
    });

    it('should log start event', async () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);
      await plugin.initialize(mockContext);
      await plugin.start();

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('started')
      );
    });

    it('should log stop event', async () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);
      await plugin.initialize(mockContext);
      await plugin.stop();

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('stopped')
      );
    });
  });

  describe('createProvider', () => {
    it('should create provider instance', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);
      const provider = plugin.createProvider({ model: 'test-model' });

      expect(provider).toBeInstanceOf(MockProvider);
      expect(provider.id).toBe('mock-provider');
    });

    it('should pass config to createProvider', () => {
      const createProviderSpy = vi.fn((config: ProviderConfig) => new MockProvider(config));

      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: createProviderSpy
      };

      const plugin = createProviderPlugin(options);
      const config = { model: 'test-model', apiKey: 'test-key' };
      plugin.createProvider(config);

      expect(createProviderSpy).toHaveBeenCalledWith(config);
    });
  });
});

describe('SimpleProvider', () => {
  describe('constructor', () => {
    it('should create provider with default model', () => {
      const provider = new MockProvider({});

      expect(provider.id).toBe('mock-provider');
      expect(provider.name).toBe('Mock Provider');
    });
  });

  describe('doInitialize', () => {
    it('should handle empty config gracefully', async () => {
      const provider = new MockProvider({});

      await expect(provider.initialize({})).resolves.not.toThrow();
    });
  });

  describe('doChatStreamFromChat', () => {
    it('should yield single response from doChat', async () => {
      const provider = new MockProvider({});
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const responses = [];
      for await (const response of provider['doChatStreamFromChat'](request)) {
        responses.push(response);
      }

      expect(responses).toHaveLength(1);
      expect(responses[0].content).toContain('Hello');
    });
  });

  describe('calculateUsage', () => {
    it('should calculate token usage correctly', () => {
      const provider = new MockProvider({});

      const usage = provider['calculateUsage']('Hello world', 'Hi there');

      expect(usage.promptTokens).toBe(Math.ceil('Hello world'.length / 4));
      expect(usage.completionTokens).toBe(Math.ceil('Hi there'.length / 4));
      expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    });

    it('should handle empty strings', () => {
      const provider = new MockProvider({});

      const usage = provider['calculateUsage']('', '');

      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens using ~4 chars per token', () => {
      const provider = new MockProvider({});

      expect(provider.estimateTokens('')).toBe(0);
      expect(provider.estimateTokens('abcd')).toBe(1);
      expect(provider.estimateTokens('abcdefgh')).toBe(2);
      expect(provider.estimateTokens('abcdefghijkl')).toBe(3);
      expect(provider.estimateTokens('abcdefghijklm')).toBe(4); // 13 chars / 4 = 3.25 -> 4
    });

    it('should handle non-ASCII characters', () => {
      const provider = new MockProvider({});

      // Just ensure it doesn't crash
      expect(provider.estimateTokens('你好世界')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('integration test', () => {
    it('should complete full chat flow', async () => {
      const provider = new MockProvider({ model: 'test-model' });
      await provider.initialize({ model: 'test-model' });

      const request: ChatRequest = {
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Test message' }]
      };

      const response = await provider.chat(request);

      expect(response.content).toContain('Test message');
      expect(response.done).toBe(true);
      expect(response.usage).toBeDefined();
      expect(response.usage?.totalTokens).toBeGreaterThan(0);
    });
  });
});
