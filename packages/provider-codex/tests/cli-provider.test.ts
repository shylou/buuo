import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChatRequest } from '@buuo/core/providers';
import { CodexCliProvider } from '../src/cli-provider.js';

function createMockChildProcess() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.pid = 12345;
  child.killed = false;
  child.kill = vi.fn((_sig?: string) => {
    child.killed = true;
  });
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

describe('CodexCliProvider', () => {
  let provider: CodexCliProvider;

  beforeEach(() => {
    provider = new CodexCliProvider('test-codex');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with custom config', async () => {
      vi.spyOn(provider as any, 'checkCliAvailable').mockImplementation(() => {});

      await provider.initialize({
        cliPath: '/usr/local/bin/codex',
        workingDirectory: '/tmp/test',
        model: 'gpt-5.4',
        requestTimeout: 60000,
        fullAuto: false,
        sandbox: 'read-only',
        configOverrides: ['model_reasoning_effort="high"'],
      });

      expect(provider.getStatus()).toMatchObject({
        available: true,
        state: 'ready',
        model: 'gpt-5.4',
      });
    });
  });

  describe('session management', () => {
    it('should track session mappings', () => {
      provider['sessionMappings'].set('session-1', 'thread-1');
      provider['sessionMappings'].set('session-2', 'thread-2');

      expect(provider.getCachedSessionCount()).toBe(2);
      expect(provider.getSessionMappings().get('session-1')).toBe('thread-1');
    });

    it('should clear session', () => {
      provider['sessionMappings'].set('session-1', 'thread-1');
      provider.clearSession('session-1');

      expect(provider.getCachedSessionCount()).toBe(0);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens from text', () => {
      const text = 'Hello world, this is a test message.';
      expect(provider.estimateTokens(text)).toBe(Math.ceil(text.length / 4));
    });
  });

  describe('argument construction', () => {
    it('should build exec args with full auto and no explicit sandbox', () => {
      provider['model'] = 'gpt-5.4';
      provider['fullAuto'] = true;
      provider['sandbox'] = 'workspace-write';

      const args = provider['buildExecArgs']('hello', undefined);

      expect(args).toEqual(['exec', '--json', '--model', 'gpt-5.4', '--full-auto', 'hello']);
      expect(args).not.toContain('--sandbox');
    });

    it('should build resume args with explicit sandbox when full auto is disabled', () => {
      provider['model'] = 'gpt-5.4';
      provider['fullAuto'] = false;
      provider['sandbox'] = 'danger-full-access';

      const args = provider['buildResumeArgs']('hello', 'thread-123', undefined);

      expect(args).toEqual([
        'exec',
        'resume',
        '--json',
        '--model',
        'gpt-5.4',
        'thread-123',
        'hello',
      ]);
      expect(args).not.toContain('--sandbox');
    });

    it('should prefer dangerous bypass flag over full auto and sandbox', () => {
      provider['model'] = 'gpt-5.4';
      provider['fullAuto'] = true;
      provider['sandbox'] = 'workspace-write';
      provider['dangerouslyBypassApprovalsAndSandbox'] = true;

      const args = provider['buildExecArgs']('hello', undefined);

      expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(args).not.toContain('--full-auto');
      expect(args).not.toContain('--sandbox');
    });
  });

  describe('prompt construction', () => {
    it('should include system prompt and image note', () => {
      const request: ChatRequest = {
        sessionId: 'test',
        systemPrompt: 'You are a coding assistant.',
        messages: [{
          role: 'user',
          content: 'Analyze this.',
          metadata: {
            attachments: [{ type: 'image', url: 'https://example.com/image.png' }],
          },
        }],
      };

      const prompt = provider['buildPrompt'](request);
      expect(prompt).toContain('You are a coding assistant.');
      expect(prompt).toContain('Analyze this.');
      expect(prompt).toContain('does not yet pass images to Codex');
    });
  });

  describe('event parsing', () => {
    it('should capture thread id from thread.started', () => {
      const messages: Array<any> = [];

      provider['parseMessageLine'](
        '{"type":"thread.started","thread_id":"thread-123"}',
        'session-1',
        (msg: any) => messages.push(msg),
        () => {}
      );

      expect(provider.getSessionMappings().get('session-1')).toBe('thread-123');
      expect(messages).toHaveLength(0);
    });

    it('should convert agent_message and turn.completed events', () => {
      const messages: Array<any> = [];
      let markedComplete = false;

      provider['parseMessageLine'](
        '{"type":"item.completed","item":{"type":"agent_message","text":"Hello from Codex"}}',
        'session-1',
        (msg: any) => messages.push(msg),
        () => {
          markedComplete = true;
        }
      );

      provider['parseMessageLine'](
        '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}',
        'session-1',
        (msg: any) => messages.push(msg),
        () => {
          markedComplete = true;
        }
      );

      expect(messages[0]).toEqual({ content: 'Hello from Codex', done: false });
      expect(messages[1]).toMatchObject({
        done: false,
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });
      expect(messages[2]).toEqual({ done: true });
      expect(markedComplete).toBe(true);
    });

    it('should turn turn.failed into an error', () => {
      const messages: Array<any> = [];
      let markedComplete = false;

      provider['parseMessageLine'](
        '{"type":"turn.failed","error":{"message":"network down"}}',
        'session-1',
        (msg: any) => messages.push(msg),
        () => {
          markedComplete = true;
        }
      );

      expect(markedComplete).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toBeInstanceOf(Error);
      expect(messages[0].message).toBe('network down');
    });
  });

  describe('cancellation', () => {
    it('should return false for non-existent session', () => {
      expect(provider.cancelRequest('missing-session')).toBe(false);
    });

    it('should cancel an active process without clearing the session mapping', () => {
      const mockChild = createMockChildProcess();
      provider['activeProcesses'].set('active-session', mockChild);
      provider['sessionMappings'].set('active-session', 'thread-123');

      const result = provider.cancelRequest('active-session');

      expect(result).toBe(true);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(provider.getSessionMappings().get('active-session')).toBe('thread-123');
    });
  });

  describe('streaming', () => {
    it('should stream parsed output from a spawned process', async () => {
      vi.spyOn(provider as any, 'checkCliAvailable').mockImplementation(() => {});
      await provider.initialize({ workingDirectory: '/tmp/test' });

      const mockChild = createMockChildProcess();
      vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'stream-session',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const chunks: ChatRequest[] = [];
      const stream = provider['doChatStream'](request);

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('{"type":"thread.started","thread_id":"thread-1"}\n'));
        mockChild.stdout.emit('data', Buffer.from('{"type":"item.completed","item":{"type":"agent_message","text":"Hi"}}\n'));
        mockChild.stdout.emit('data', Buffer.from('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":6}}\n'));
        mockChild.emit('close', 0);
      }, 10);

      const results: any[] = [];
      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results.some(r => r.content === 'Hi')).toBe(true);
      expect(results.some(r => r.done === true)).toBe(true);
      expect(provider.getSessionMappings().get('stream-session')).toBe('thread-1');
      expect(chunks).toHaveLength(0);
    });

    it('should resume an existing codex thread for the same buuo session', async () => {
      vi.spyOn(provider as any, 'checkCliAvailable').mockImplementation(() => {});
      await provider.initialize({ workingDirectory: '/tmp/test' });

      provider['sessionMappings'].set('resume-session', 'thread-existing');
      const mockChild = createMockChildProcess();
      const spawnSpy = vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'resume-session',
        messages: [{ role: 'user', content: 'Continue' }],
      };

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}\n'));
        mockChild.stdout.emit('data', Buffer.from('{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n'));
        mockChild.emit('close', 0);
      }, 10);

      const results: any[] = [];
      for await (const chunk of provider['doChatStream'](request)) {
        results.push(chunk);
      }

      expect(spawnSpy).toHaveBeenCalled();
      expect(spawnSpy.mock.calls[0]?.[0]).toContain('resume');
      expect(spawnSpy.mock.calls[0]?.[0]).toContain('thread-existing');
      expect(results.some(r => r.content === 'Done')).toBe(true);
    });

    it('should surface a non-zero process exit as a provider error', async () => {
      vi.spyOn(provider as any, 'checkCliAvailable').mockImplementation(() => {});
      await provider.initialize({ workingDirectory: '/tmp/test' });

      const mockChild = createMockChildProcess();
      vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'failed-session',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      setTimeout(() => {
        mockChild.stderr.emit('data', Buffer.from('sandbox denied'));
        mockChild.emit('close', 2);
      }, 10);

      await expect(async () => {
        for await (const _chunk of provider['doChatStream'](request)) {
          // drain
        }
      }).rejects.toThrow('Codex CLI sandbox error: sandbox denied');
    });

    it('should stop cleanly after cancellation without emitting a close error', async () => {
      vi.spyOn(provider as any, 'checkCliAvailable').mockImplementation(() => {});
      await provider.initialize({ workingDirectory: '/tmp/test' });

      const mockChild = createMockChildProcess();
      vi.spyOn(provider as any, 'spawnProcess').mockReturnValue(mockChild);

      const request: ChatRequest = {
        sessionId: 'cancelled-session',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const streamPromise = (async () => {
        const results: any[] = [];
        for await (const chunk of provider['doChatStream'](request)) {
          results.push(chunk);
        }
        return results;
      })();

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(provider.cancelRequest('cancelled-session')).toBe(true);

      setTimeout(() => {
        mockChild.emit('close', 1);
      }, 10);

      await expect(streamPromise).resolves.toEqual([]);
    });
  });
});
