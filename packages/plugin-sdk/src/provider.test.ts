/**
 * Provider Plugin SDK tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProviderPlugin,
  SimpleProvider,
  ProviderPluginValidationError
} from './provider.js';
import type { AIProvider, ProviderConfig, ChatRequest, ChatResponse } from '@buuo/core/providers';
import type { ProviderPlugin, PluginContext } from '@buuo/core/plugins';

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

  describe('validation', () => {
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

    it('should throw validation error for missing id', () => {
      const options = {
        id: '',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      expect(() => createProviderPlugin(options as any)).toThrow(ProviderPluginValidationError);
      expect(() => createProviderPlugin(options as any)).toThrow(/id/);
    });

    it('should throw validation error for whitespace-only id', () => {
      const options = {
        id: '   ',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      expect(() => createProviderPlugin(options as any)).toThrow(ProviderPluginValidationError);
    });

    it('should throw validation error for missing name', () => {
      const options = {
        id: 'test-provider',
        name: '',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      expect(() => createProviderPlugin(options as any)).toThrow(ProviderPluginValidationError);
      expect(() => createProviderPlugin(options as any)).toThrow(/name/);
    });

    it('should throw validation error for missing version', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      expect(() => createProviderPlugin(options as any)).toThrow(ProviderPluginValidationError);
      expect(() => createProviderPlugin(options as any)).toThrow(/version/);
    });

    it('should throw validation error for invalid semver format', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: 'invalid',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      expect(() => createProviderPlugin(options as any)).toThrow(ProviderPluginValidationError);
      expect(() => createProviderPlugin(options as any)).toThrow(/semver/);
    });

    it('should accept valid semver versions', () => {
      const validVersions = [
        '1.0.0',
        '2.3.4',
        '10.20.30',
        '1.0.0-alpha',
        '1.0.0-beta.1',
        '1.0.0+build',
        '1.0.0-alpha-1',        // hyphen in identifier (was previously rejected)
        '1.0.0-beta.2',         // multiple dot-separated identifiers
        '1.0.0-alpha.1.beta',    // multiple identifiers
        '1.0.0-rc.1+build.123',  // prerelease + build
        '2.0.0-alpha-1+exp.sha.5114f85'
      ];

      validVersions.forEach(version => {
        const options = {
          id: 'test-provider',
          name: 'Test Provider',
          version,
          description: 'A test provider',
          createProvider: (config: ProviderConfig) => new MockProvider(config)
        };

        expect(() => createProviderPlugin(options)).not.toThrow();
      });
    });

    it('should reject semver with invalid identifier hyphen placement', () => {
      const invalidVersions = [
        '1.0.0--alpha',         // consecutive hyphens
        '1.0.0-alpha-',         // trailing hyphen
        '1.0.0--beta.1',        // consecutive hyphens in identifier
        '1.0.0-alpha-.1',       // trailing hyphen in identifier
        '1.0.0+build--meta',    // consecutive hyphens in build
        '1.0.0+-beta'           // leading hyphen in build
      ];

      invalidVersions.forEach(version => {
        const options = {
          id: 'test-provider',
          name: 'Test Provider',
          version,
          description: 'A test provider',
          createProvider: (config: ProviderConfig) => new MockProvider(config)
        };

        expect(() => createProviderPlugin(options)).toThrow(ProviderPluginValidationError);
        expect(() => createProviderPlugin(options)).toThrow(/hyphen/);
      });
    });

    it('should throw validation error for missing description', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: '',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      expect(() => createProviderPlugin(options as any)).toThrow(ProviderPluginValidationError);
      expect(() => createProviderPlugin(options as any)).toThrow(/description/);
    });

    it('should throw validation error for non-function createProvider', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: 'not-a-function' as any
      };

      expect(() => createProviderPlugin(options)).toThrow(ProviderPluginValidationError);
      expect(() => createProviderPlugin(options)).toThrow(/createProvider/);
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

    it('should include version in initialization log', async () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '2.1.0',
        description: 'A test provider',
        createProvider: (config: ProviderConfig) => new MockProvider(config)
      };

      const plugin = createProviderPlugin(options);
      await plugin.initialize(mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('v2.1.0')
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

    it('should throw error if createProvider returns invalid object', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: () => ({ invalid: 'object' }) as any
      };

      const plugin = createProviderPlugin(options);

      expect(() => plugin.createProvider({})).toThrow(/must have a string id property/);
    });

    it('should throw error if createProvider returns null', () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: () => null as any
      };

      const plugin = createProviderPlugin(options);

      expect(() => plugin.createProvider({})).toThrow(/must return an object/);
    });

    it('should log error when provider creation fails', async () => {
      const options = {
        id: 'test-provider',
        name: 'Test Provider',
        version: '1.0.0',
        description: 'A test provider',
        createProvider: () => {
          throw new Error('Creation failed');
        }
      };

      const plugin = createProviderPlugin(options);
      await plugin.initialize(mockContext);

      expect(() => plugin.createProvider({})).toThrow(/Provider creation failed/);
      expect(mockContext.logger.error).toHaveBeenCalled();
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

    it('should use provided default model', () => {
      const provider = new MockProvider({ model: 'custom-model' });

      expect(provider['defaultModel']).toBe('custom-model');
    });
  });

  describe('doInitialize', () => {
    it('should update default model from config', async () => {
      const provider = new MockProvider({});
      provider._config = { model: 'configured-model' };

      await provider.doInitialize();

      expect(provider['defaultModel']).toBe('configured-model');
    });

    it('should handle undefined config gracefully', async () => {
      const provider = new MockProvider({});
      provider._config = undefined;

      await expect(provider.doInitialize()).resolves.not.toThrow();
    });

    it('should handle config without model', async () => {
      const provider = new MockProvider({});
      provider._config = {};

      await provider.doInitialize();

      expect(provider['defaultModel']).toBe('default');
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

describe('ProviderPluginValidationError', () => {
  it('should create error with field and reason', () => {
    const error = new ProviderPluginValidationError('id', 'must be present');

    expect(error.name).toBe('ProviderPluginValidationError');
    expect(error.message).toContain('id');
    expect(error.message).toContain('must be present');
  });
});
