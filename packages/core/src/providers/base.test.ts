/**
 * BaseProvider tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseProvider } from './base.js';
import {
  ProviderAlreadyInitializedError,
  ProviderNotInitializedError
} from './errors.js';
import type { ChatRequest, ChatResponse } from './interface.js';

class TestProvider extends BaseProvider {
  constructor() {
    super('test-provider', 'Test Provider');
  }

  protected async doInitialize(): Promise<void> {
    // Test initialization logic
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    return {
      content: `Response to: ${request.messages[request.messages.length - 1]?.content}`,
      done: true,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    };
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    yield { content: 'Stream ', done: false };
    yield { content: 'response', done: false };
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

describe('BaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  describe('Construction', () => {
    it('should create provider with id and name', () => {
      expect(provider.id).toBe('test-provider');
      expect(provider.name).toBe('Test Provider');
    });

    it('should not be initialized by default', () => {
      expect(provider.initialized).toBe(false);
    });

    it('should have uninitialized status', () => {
      const status = provider.getStatus();
      expect(status.available).toBe(false);
      expect(status.state).toBe('uninitialized');
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await provider.initialize({ apiKey: 'test-key', model: 'claude-sonnet-4-6' });

      expect(provider.initialized).toBe(true);
      expect(provider.getStatus().state).toBe('ready');
      expect(provider.getStatus().available).toBe(true);
    });

    it('should throw when already initialized', async () => {
      await provider.initialize({ apiKey: 'test-key' });

      await expect(provider.initialize({ apiKey: 'test-key' }))
        .rejects.toThrow(ProviderAlreadyInitializedError);
    });

    it('should emit initialized event', async () => {
      const emitSpy = vi.spyOn(provider, 'emit');
      await provider.initialize({ apiKey: 'test-key' });

      expect(emitSpy).toHaveBeenCalledWith('initialized');
    });
  });

  describe('Chat', () => {
    it('should throw when not initialized', async () => {
      const request: ChatRequest = {
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(provider.chat(request))
        .rejects.toThrow(ProviderNotInitializedError);
    });

    it('should handle chat request successfully', async () => {
      await provider.initialize({ apiKey: 'test-key' });

      const request: ChatRequest = {
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const response = await provider.chat(request);

      expect(response.content).toContain('Response to');
      expect(response.done).toBe(true);
    });

    it('should emit status change events', async () => {
      await provider.initialize({ apiKey: 'test-key' });
      const emitSpy = vi.spyOn(provider, 'emit');

      const request: ChatRequest = {
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await provider.chat(request);

      // Should emit status:change at least twice (busy -> ready)
      expect(emitSpy).toHaveBeenCalledWith('status:change', expect.any(Object));
    });
  });

  describe('Chat Stream', () => {
    it('should throw when not initialized', async () => {
      const request: ChatRequest = {
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const stream = provider.chatStream(request);
      const chunks = [];

      try {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        expect.unreachable('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderNotInitializedError);
      }
    });

    it('should handle streaming request successfully', async () => {
      await provider.initialize({ apiKey: 'test-key' });

      const request: ChatRequest = {
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const chunks = [];
      for await (const chunk of provider.chatStream(request)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(3);
      expect(chunks[0].content).toBe('Stream ');
      expect(chunks[1].content).toBe('response');
      expect(chunks[2].done).toBe(true);
    });
  });

  describe('Status', () => {
    it('should return frozen status object', async () => {
      await provider.initialize({ apiKey: 'test-key', model: 'test-model' });

      const status = provider.getStatus();

      // Attempting to modify frozen object should throw
      expect(() => {
        (status as any).state = 'modified';
      }).toThrow();

      // Internal status should remain unchanged
      expect(provider.getStatus().state).toBe('ready');
    });

    it('should return same cached status when unchanged', async () => {
      await provider.initialize({ apiKey: 'test-key' });

      const status1 = provider.getStatus();
      const status2 = provider.getStatus();

      // Should return the same frozen object (same reference)
      expect(status1).toBe(status2);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for text', () => {
      const text = 'Hello, world!';
      const tokens = provider.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });
  });
});
