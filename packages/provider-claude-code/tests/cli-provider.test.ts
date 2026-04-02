/**
 * Claude Code CLI Provider tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ClaudeCodeProvider } from '../src/cli-provider.js';
import type { ChatRequest } from '@buuo/core/providers';

/** Create a mock ChildProcess with controllable stdout/stderr/stdin */
function createMockChildProcess() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.pid = 12345;
  child.killed = false;
  child.kill = vi.fn((_sig?: string) => { child.killed = true; });
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

describe('ClaudeCodeProvider', () => {
  let provider: ClaudeCodeProvider;

  beforeEach(() => {
    provider = new ClaudeCodeProvider('test-claude-code');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('initialization', () => {
    it('should create provider with default config', () => {
      expect(provider.id).toBe('test-claude-code');
    });

    it('should initialize with custom config', async () => {
      await provider.initialize({
        cliPath: '/usr/local/bin/claude',
        workingDirectory: '/tmp/test',
        enableTools: true,
        requestTimeout: 60000,
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
      // Use the internal map directly (sessionManager was renamed)
      provider['claudeSessionIds'].set('session-1', 'uuid-1');
      provider['claudeSessionIds'].set('session-2', 'uuid-2');

      expect(provider.getCachedSessionCount()).toBe(2);
      expect(provider.getSessionMappings().get('session-1')).toBe('uuid-1');
    });

    it('should clear session', () => {
      provider['claudeSessionIds'].set('session-1', 'uuid-1');
      provider.clearSession('session-1');

      expect(provider.getCachedSessionCount()).toBe(0);
    });

    it('should get session count', () => {
      expect(provider.getCachedSessionCount()).toBe(0);

      provider['claudeSessionIds'].set('session-1', 'uuid-1');
      expect(provider.getCachedSessionCount()).toBe(1);
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

  describe('message building', () => {
    it('should build current message with text only (last message only)', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const message = provider['buildCurrentMessage'](request);
      // buildCurrentMessage returns raw content of the last message, no prefix
      expect(message).toBe('Hello');
    });

    it('should build current message with image attachments', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [{
          role: 'user',
          content: 'What is in this image?',
          metadata: {
            attachments: [{
              type: 'image',
              url: 'https://example.com/image.png',
            }],
          },
        }],
      };

      const message = provider['buildCurrentMessage'](request);
      expect(message).toContain('What is in this image?');
      expect(message).toContain('[Image:');
    });

    it('should handle Lark images without URL', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [{
          role: 'user',
          content: 'Analyze this',
          metadata: {
            attachments: [{
              type: 'image',
              metadata: { platform: 'lark' },
            }],
          },
        }],
      };

      const message = provider['buildCurrentMessage'](request);
      expect(message).toContain('Lark image received');
    });

    it('should only use the last message (no history)', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' },
        ],
      };

      const message = provider['buildCurrentMessage'](request);
      // Only the last message's content is used
      expect(message).toBe('Second message');
      expect(message).not.toContain('First message');
      expect(message).not.toContain('First response');
    });

    it('should return empty string for empty messages array', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [],
      };

      const message = provider['buildCurrentMessage'](request);
      expect(message).toBe('');
    });

    it('should handle messages without content', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        messages: [{ role: 'user', content: '' }],
      };

      const message = provider['buildCurrentMessage'](request);
      expect(message).toBe('');
    });
  });

  describe('tool input formatting', () => {
    it('should format file inputs', () => {
      const result = provider['formatToolInput']({ file: '/path/to/file.ts' });
      expect(result).toContain('/path/to/file.ts');
    });

    it('should format query inputs', () => {
      const result = provider['formatToolInput']({ query: 'search term' });
      expect(result).toContain('search term');
    });

    it('should format path inputs', () => {
      const result = provider['formatToolInput']({ path: '/src/index.ts' });
      expect(result).toContain('/src/index.ts');
    });

    it('should truncate long string inputs', () => {
      const longString = 'a'.repeat(200);
      const result = provider['formatToolInput'](longString);
      expect(result.length).toBeLessThan(200);
      expect(result).toContain('...');
    });

    it('should handle null and undefined', () => {
      expect(provider['formatToolInput'](null)).toBe('');
      expect(provider['formatToolInput'](undefined)).toBe('');
    });
  });

  describe('cancellation', () => {
    it('should return false for non-existent session', () => {
      const result = provider.cancelRequest('non-existent');
      expect(result).toBe(false);
    });

    it('should track active requests', () => {
      expect(provider.hasActiveRequest('test-session')).toBe(false);
    });
  });

  describe('CLI argument construction', () => {
    it('should include --system-prompt when systemPrompt is set', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        enableTools: false,
      });

      const capturedArgs: string[] = [];
      const mockChild = createMockChildProcess();

      // Capture args passed to spawnProcess
      vi.spyOn(provider as any, 'spawnProcess').mockImplementation((args: string[]) => {
        capturedArgs.push(...args);
        return mockChild;
      });

      const request: ChatRequest = {
        sessionId: 'test-sys-prompt',
        systemPrompt: 'You are a coding assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      // Start streaming (don't await — we need to simulate close)
      const stream = provider['doChatStream'](request);
      const iter = stream[Symbol.asyncIterator]();

      // Drive one iteration so spawnProcess is called
      iter.next().catch(() => {});

      // Simulate close with success
      mockChild.stdout.emit('data', Buffer.from('{"type":"result","usage":{"input_tokens":10,"output_tokens":5}}\n'));
      mockChild.emit('close', 0);

      // Verify --system-prompt was included
      expect(capturedArgs).toContain('--system-prompt');
      const sysPromptIdx = capturedArgs.indexOf('--system-prompt');
      expect(capturedArgs[sysPromptIdx + 1]).toBe('You are a coding assistant.');
    });

    it('should NOT include --system-prompt when systemPrompt is empty', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        enableTools: false,
      });

      const capturedArgs: string[] = [];
      const mockChild = createMockChildProcess();

      vi.spyOn(provider as any, 'spawnProcess').mockImplementation((args: string[]) => {
        capturedArgs.push(...args);
        return mockChild;
      });

      const request: ChatRequest = {
        sessionId: 'test-no-sys-prompt',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const stream = provider['doChatStream'](request);
      const iter = stream[Symbol.asyncIterator]();
      iter.next().catch(() => {});

      mockChild.stdout.emit('data', Buffer.from('{"type":"result","usage":{"input_tokens":10,"output_tokens":5}}\n'));
      mockChild.emit('close', 0);

      expect(capturedArgs).not.toContain('--system-prompt');
    });
  });

  describe('process exit handling', () => {
    it('should throw error on non-zero exit with no output', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        enableTools: false,
      });

      const mockChild = createMockChildProcess();
      vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'test-exit-fail',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const stream = provider['doChatStream'](request);

      // Emit close with non-zero exit and no data
      setTimeout(() => mockChild.emit('close', 1), 10);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) { /* drain */ }
      }).rejects.toThrow('Claude CLI failed (exit code: 1)');
    });

    it('should throw error on non-zero exit even with partial output', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        enableTools: false,
      });

      const mockChild = createMockChildProcess();
      vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'test-exit-partial',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const stream = provider['doChatStream'](request);
      const collected: string[] = [];

      // Emit partial data then close with error
      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"partial answer"}]}}\n'));
        mockChild.emit('close', 1);
      }, 10);

      await expect(async () => {
        for await (const chunk of stream) {
          if (chunk.content) collected.push(chunk.content);
        }
      }).rejects.toThrow('output may be truncated');

      // Verify partial data was still delivered before the error
      expect(collected).toContain('partial answer');
    });

    it('should complete cleanly on exit code 0', async () => {
      await provider.initialize({
        workingDirectory: '/tmp/test',
        enableTools: false,
      });

      const mockChild = createMockChildProcess();
      vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'test-exit-ok',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const stream = provider['doChatStream'](request);
      const results: any[] = [];

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"Hello!"}]}}\n'));
        mockChild.emit('close', 0);
      }, 10);

      for await (const chunk of stream) {
        results.push(chunk);
      }

      // Should complete without error
      const doneMsg = results.find(r => r.done === true);
      expect(doneMsg).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources', async () => {
      provider['claudeSessionIds'].set('session-1', 'uuid-1');
      provider['claudeSessionIds'].set('session-2', 'uuid-2');

      await provider.cleanup();

      expect(provider.getCachedSessionCount()).toBe(0);
    });
  });
});
