/**
 * Agent SDK Provider tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentSDKProvider } from '../src/sdk-provider.js';
import type { ChatRequest } from '@buuo/core/providers';

describe('AgentSDKProvider', () => {
  let provider: AgentSDKProvider;

  beforeEach(() => {
    provider = new AgentSDKProvider('test-agent-sdk');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('initialization', () => {
    it('should create provider with default config', () => {
      expect(provider.id).toBe('test-agent-sdk');
    });

    it('should initialize with custom config', async () => {
      await provider.initialize({
        model: 'claude-opus-4-20250514',
        workingDirectory: '/tmp/test',
        requestTimeout: 120000,
        enableFileCheckpointing: true,
        allowedTools: ['bash', 'edit'],
      });

      expect(provider['_status']).toMatchObject({
        available: true,
        state: 'ready',
      });
    });
  });

  describe('session management', () => {
    it('should track session mappings', () => {
      provider['sessionMappings'].set('session-1', 'agent-session-1');
      provider['sessionMappings'].set('session-2', 'agent-session-2');

      expect(provider.getCachedSessionCount()).toBe(2);
      expect(provider.getSessionMappings().get('session-1')).toBe('agent-session-1');
    });

    it('should clear session', () => {
      provider['sessionMappings'].set('session-1', 'agent-session-1');
      provider.clearSession('session-1');

      expect(provider.getCachedSessionCount()).toBe(0);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens from text', () => {
      const text = 'Hello world, this is a test message.';
      const estimated = provider.estimateTokens(text);

      expect(estimated).toBeGreaterThan(0);
      expect(estimated).toBe(Math.ceil(text.length / 4));
    });

    it('should return 0 for empty string', () => {
      expect(provider.estimateTokens('')).toBe(0);
    });
  });

  describe('SDK message conversion', () => {
    it('should handle assistant message with text', () => {
      const message = {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: 'Hello, how can I help?',
          }],
        },
      };

      const response = provider['convertSDKMessageToChatResponse'](message);
      expect(response).toEqual({
        content: 'Hello, how can I help?',
        done: false,
      });
    });

    it('should handle assistant message with thinking', () => {
      const message = {
        type: 'assistant',
        message: {
          content: [{
            type: 'thinking',
            thinking: 'Let me analyze this...',
          }],
        },
      };

      const response = provider['convertSDKMessageToChatResponse'](message);
      expect(response).toEqual({
        done: false,
        thinking: { type: 'thinking', content: 'Let me analyze this...' },
      });
    });

    it('should handle system message', () => {
      const message = {
        type: 'system',
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'auto',
      };

      const response = provider['convertSDKMessageToChatResponse'](message);
      expect(response).toBeNull();
    });

    it('should handle stream event - message_start', () => {
      const message = {
        type: 'stream_event',
        event: { type: 'message_start' },
      };

      const response = provider['convertSDKMessageToChatResponse'](message);
      expect(response).toEqual({
        done: false,
        thinking: { type: 'thinking', content: 'Connected to Claude...' },
      });
    });

    it('should handle stream event - content_block_delta', () => {
      const message = {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        },
      };

      const response = provider['convertSDKMessageToChatResponse'](message);
      expect(response).toEqual({
        content: 'Hello',
        done: false,
      });
    });

    it('should handle result message with usage', () => {
      const message = {
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      const response = provider['convertSDKMessageToChatResponse'](message);
      expect(response).toEqual({
        done: true,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });
    });

    it('should return null for ignored message types', () => {
      const ignoredTypes = [
        'user', 'user_message_replay', 'compact_boundary', 'status',
        'local_command_output', 'hook_started', 'tool_progress',
      ];

      ignoredTypes.forEach(type => {
        const message = { type };
        const response = provider['convertSDKMessageToChatResponse'](message);
        expect(response).toBeNull();
      });
    });
  });

  describe('cancellation', () => {
    it('should return false (synchronously) for non-existent session', () => {
      // cancelRequest must return a plain boolean, not a Promise
      const result = provider.cancelRequest('non-existent');
      expect(result).toBe(false);
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('should return true synchronously when abort controller exists', () => {
      // Simulate an active request
      const controller = new AbortController();
      provider['activeControllers'].set('active-session', controller);

      const result = provider.cancelRequest('active-session');
      expect(result).toBe(true);
      expect(result).not.toBeInstanceOf(Promise);
      expect(controller.signal.aborted).toBe(true);
      expect(provider.hasActiveRequest('active-session')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources', async () => {
      provider['sessionMappings'].set('session-1', 'agent-session-1');
      provider['sessionMappings'].set('session-2', 'agent-session-2');

      await provider.cleanup();

      expect(provider.getCachedSessionCount()).toBe(0);
    });
  });
});
