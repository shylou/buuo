/**
 * Claude Code Provider - Local Claude Code CLI integration
 *
 * Connects buuo to local Claude Code CLI for AI-powered interactions with tool access.
 */

import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
} from '@buuo/core/providers';
import { BaseProvider } from '@buuo/core/providers';

export interface ClaudeCodeConfig extends ProviderConfig {
  /** Path to claude CLI (default: 'claude') */
  cliPath?: string;
  /** Working directory for Claude Code */
  workingDirectory?: string;
  /** Enable tool access (default: true) */
  enableTools?: boolean;
  /** Session timeout in milliseconds (default: 3600000 = 1 hour) */
  sessionTimeout?: number;
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  requestTimeout?: number;
}

interface SessionState {
  id: string;
  cliSessionId: string;
  lastUsed: number;
  childProcess?: ChildProcess;
  requestTimer?: NodeJS.Timeout;
  isActive: boolean;
}

export class ClaudeCodeProvider extends BaseProvider {
  private cliPath: string;
  private workingDirectory: string;
  private enableTools: boolean;
  private sessionTimeout: number;
  private requestTimeout: number;
  private sessions: Map<string, SessionState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private cleanEnv: Record<string, string> | null = null; // Cached environment

  constructor(id: string = 'claude-code') {
    super(id, 'Claude Code');
    this.cliPath = 'claude';
    this.workingDirectory = process.cwd();
    this.enableTools = true;
    this.sessionTimeout = 3600000; // 1 hour
    this.requestTimeout = 300000; // 5 minutes
  }

  protected async doInitialize(): Promise<void> {
    const config = this._config as ClaudeCodeConfig;

    if (config.cliPath) this.cliPath = config.cliPath;
    if (config.workingDirectory) this.workingDirectory = config.workingDirectory;
    if (config.enableTools !== undefined) this.enableTools = config.enableTools;
    if (config.sessionTimeout !== undefined) this.sessionTimeout = config.sessionTimeout;
    if (config.requestTimeout !== undefined) this.requestTimeout = config.requestTimeout;

    // Start cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 300000);

    this._status = {
      available: true,
      state: 'ready',
      model: 'claude-code-local',
    };

    console.log(`[ClaudeCodeProvider] Initialized: ${this.cliPath}`);
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const response of this.doChatStream(request)) {
      if (response.content) fullContent += response.content;
      if (response.usage) {
        totalInputTokens = response.usage.promptTokens || 0;
        totalOutputTokens = response.usage.completionTokens || 0;
      }
      if (response.done) break;
    }

    return {
      content: fullContent,
      done: true,
      usage: {
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
    };
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const buuoSessionId = request.sessionId || this.generateSessionId();
    const session = await this.getOrCreateSession(buuoSessionId);
    const cliSessionId = session.cliSessionId;
    const prompt = this.buildPrompt(request);

    console.log(`[ClaudeCodeProvider] Request: ${buuoSessionId} -> ${cliSessionId}`);

    // Build CLI arguments
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      '--session-id', cliSessionId,
      '--permission-mode', 'auto',
      prompt,
    ];

    if (!this.enableTools) {
      args.push('--allowed-tools', '');
    }

    // Spawn Claude CLI process
    let childProcess: ChildProcess;
    try {
      const cleanEnv = this.createCleanEnvironment();
      childProcess = spawn(this.cliPath, args, {
        cwd: this.workingDirectory,
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      console.log(`[ClaudeCodeProvider] Spawned: PID=${childProcess.pid}`);
    } catch (error) {
      throw new Error(`Failed to start Claude CLI: ${error}`);
    }

    session.childProcess = childProcess;
    session.isActive = true;

    // Setup request timeout
    const timeoutId = setTimeout(() => {
      console.error(`[ClaudeCodeProvider] Timeout: ${buuoSessionId}`);
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    }, this.requestTimeout);
    session.requestTimer = timeoutId;

    // Message queue for async handling (optimized with efficient signaling)
    const messageQueue: (ChatResponse | Error | null)[] = [];
    let resolveWait: (() => void) | null = null;
    let isDone = false;
    let hasReceivedData = false;

    const enqueue = (msg: ChatResponse | Error | null) => {
      const isDoneSignal = msg && !(msg instanceof Error) && msg.done === true;
      if (msg && (isDoneSignal || !isDone)) {
        messageQueue.push(msg);
        // Signal waiting consumer immediately
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
    };

    let buffer = '';

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      hasReceivedData = true;
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        this.parseMessageLine(line, enqueue);
      }
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const stderr = data.toString();
      if (stderr.includes('Error:') || stderr.includes('error:')) {
        enqueue(new Error(`Claude CLI error: ${stderr.substring(0, 500)}`));
      }
    });

    // Track request start time for timeout
    const startTime = Date.now();

    // Handle process completion
    childProcess.on('close', (code: number | null) => {
      if (!hasReceivedData && code !== 0) {
        enqueue(new Error(`Claude CLI failed (exit code: ${code})`));
      }
      isDone = true;
      enqueue({ done: true });
    });

    childProcess.on('error', (err: Error) => {
      enqueue(new Error(`Claude CLI process error: ${err.message}`));
      isDone = true;
      enqueue({ done: true });
    });

    // Yield messages from queue (optimized with immediate signaling)
    let yieldedCount = 0;

    while (!isDone || messageQueue.length > 0) {
      // Check timeout less frequently (every 10 iterations)
      if (yieldedCount % 10 === 0) {
        if (Date.now() - startTime > this.requestTimeout) {
          if (childProcess && !childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
          throw new Error(`Request timeout after ${this.requestTimeout}ms`);
        }
      }

      if (messageQueue.length === 0 && !isDone) {
        // Wait for new message with shorter polling interval
        await new Promise<void>(resolve => {
          resolveWait = resolve;
          setTimeout(resolve, 50); // 50ms instead of 1000ms
        });
      }

      const msg = messageQueue.shift();
      if (msg) {
        if (msg instanceof Error) throw msg;
        yieldedCount++;
        yield msg;
        if (msg.done) break;
      }
    }

    // Only log when debug mode is needed (reduce console spam)
    // console.log(`[ClaudeCodeProvider] Complete: ${yieldedCount} messages`);

    // Cleanup
    clearTimeout(timeoutId);
    if (session.requestTimer === timeoutId) {
      session.requestTimer = undefined;
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private createCleanEnvironment(): Record<string, string> {
    // Use cached environment if available (process env doesn't change during runtime)
    if (this.cleanEnv) {
      return this.cleanEnv;
    }

    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      // Skip CLAUDECODE variables to allow nested calls
      if (!key.startsWith('CLAUDECODE') &&
          key !== 'CLAUDE_CODE_ENTRYPOINT' &&
          key !== 'CLAUDE_CODE_SSE_PORT' &&
          value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    this.cleanEnv = cleanEnv;
    return cleanEnv;
  }

  private parseMessageLine(line: string, enqueue: (msg: ChatResponse | Error | null) => void): void {
    try {
      const message = JSON.parse(line) as any;

      switch (message.type) {
        case 'assistant':
          if (message.message?.content) {
            for (const item of message.message.content) {
              if (item.type === 'text' && item.text) {
                enqueue({ content: item.text, done: false });
              }
            }
          }
          break;

        case 'stream_event':
          if (message.event?.type === 'message_delta' && message.event?.usage) {
            enqueue({
              done: false,
              usage: {
                promptTokens: message.event.usage.input_tokens || 0,
                completionTokens: message.event.usage.output_tokens || 0,
                totalTokens: (message.event.usage.input_tokens || 0) + (message.event.usage.output_tokens || 0),
              },
            });
          }
          break;

        case 'result':
          if (message.usage) {
            enqueue({
              done: false,
              usage: {
                promptTokens: message.usage.input_tokens || 0,
                completionTokens: message.usage.output_tokens || 0,
                totalTokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0),
              },
            });
          }
          break;

        case 'error':
          enqueue(new Error(message.error || message.message || 'Unknown error from Claude CLI'));
          break;
        default:
          if (message.is_error) {
            enqueue(new Error(message.error || message.message || 'Unknown error from Claude CLI'));
          }
          break;
      }
    } catch (e) {
      // Ignore JSON parse errors for non-JSON lines
    }
  }

  private generateSessionId(): string {
    return uuidv4();
  }

  private async getOrCreateSession(buuoSessionId: string): Promise<SessionState> {
    let session = this.sessions.get(buuoSessionId);

    if (!session) {
      session = {
        id: buuoSessionId,
        cliSessionId: this.generateSessionId(),
        lastUsed: Date.now(),
        isActive: false,
      };
      this.sessions.set(buuoSessionId, session);
    }

    session.lastUsed = Date.now();
    return session;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastUsed > this.sessionTimeout) {
        expiredSessions.push(id);
        if (session.requestTimer) {
          clearTimeout(session.requestTimer);
        }
        if (session.childProcess && !session.childProcess.killed) {
          session.childProcess.kill('SIGTERM');
        }
      }
    }

    for (const id of expiredSessions) {
      this.sessions.delete(id);
    }

    if (expiredSessions.length > 0) {
      console.log(`[ClaudeCodeProvider] Cleaned ${expiredSessions.length} expired session(s)`);
    }
  }

  private buildPrompt(request: ChatRequest): string {
    let prompt = '';

    if (request.systemPrompt) {
      prompt += `System: ${request.systemPrompt}\n\n`;
    }

    for (const msg of request.messages) {
      switch (msg.role) {
        case 'system':
          prompt += `System: ${msg.content}\n\n`;
          break;
        case 'user':
          prompt += `User: ${msg.content}\n\n`;
          break;
        case 'assistant':
          prompt += `Assistant: ${msg.content}\n\n`;
          break;
        case 'tool':
          prompt += `Tool Result: ${msg.content}\n\n`;
          break;
      }
    }

    return prompt.trim();
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [id, session] of this.sessions.entries()) {
      if (session.requestTimer) {
        clearTimeout(session.requestTimer);
      }
      if (session.childProcess && !session.childProcess.killed) {
        try {
          session.childProcess.kill('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (!session.childProcess.killed) {
            session.childProcess.kill('SIGKILL');
          }
        } catch (e) {
          console.error(`[ClaudeCodeProvider] Error killing process ${id}:`, e);
        }
      }
    }

    this.sessions.clear();
    console.log('[ClaudeCodeProvider] Cleanup complete');
  }
}
