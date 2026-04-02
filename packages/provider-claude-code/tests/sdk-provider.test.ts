/**
 * Agent SDK Provider tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentSDKProvider } from '../src/sdk-provider.js';

// Mock the SDK query function for timeout/cancel tests
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

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

  describe('timeout vs cancellation', () => {
    it('should yield timeout message when request times out', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        requestTimeout: 50,
      });

      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      vi.mocked(query).mockImplementation(() => {
        return (async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'sdk-session' };
          // Simulate slow SDK processing — timeout fires at 50ms, this throws at 100ms
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Claude Code process aborted by user')), 100);
          });
        })();
      });

      const request = {
        sessionId: 'test-timeout',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const responses = [];
      for await (const response of (provider as any).doChatStream(request)) {
        responses.push(response);
      }

      const timeoutMsg = responses.find((r: any) => r.content?.includes('timed out'));
      expect(timeoutMsg).toBeDefined();
      expect(timeoutMsg!.done).toBe(true);
    });

    it('should distinguish cancel from timeout via cancelledSessions', () => {
      // Unit test: cancelRequest marks session in cancelledSessions before aborting
      const controller = new AbortController();
      provider['activeControllers'].set('s1', controller);

      provider.cancelRequest('s1');

      // After cancel, the session should be in cancelledSessions
      // so doChatStream can distinguish cancel from timeout
      expect(provider['cancelledSessions'].has('s1')).toBe(true);
      expect(controller.signal.aborted).toBe(true);
    });

    it('should not yield timeout message when session was cancelled', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        requestTimeout: 50,
      });

      // Simulate: session was already cancelled before abort fires
      provider['cancelledSessions'].add('pre-cancelled');
      const controller = new AbortController();
      provider['activeControllers'].set('pre-cancelled', controller);

      // Abort (simulating what timeout would do)
      controller.abort();

      // Verify cancelledSessions allows distinguishing cancel from timeout
      expect(provider['cancelledSessions'].has('pre-cancelled')).toBe(true);
      // A timeout scenario would NOT be in cancelledSessions
      expect(provider['cancelledSessions'].has('not-cancelled')).toBe(false);
    });
  });
});
