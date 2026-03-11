/**
 * Claude Code Provider
 *
 * Uses Claude Code's --resume functionality for efficient context management:
 * - First request: Creates new session with --session-id, caches the ID
 * - Subsequent requests: Uses --resume to continue the session
 * - Claude Code manages disk-based history automatically
 * - Only sends current message, 90%+ token savings
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
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  requestTimeout?: number;
}

/** Constants for configuration */
const DEFAULT_TIMEOUT = 300000;
const DEFAULT_CLI_PATH = 'claude';
const POLL_INTERVAL = 50;
const MAX_LOG_LENGTH = 200;
const MAX_TOOL_INPUT_LENGTH = 100;
const MAX_IMAGE_PATH_LENGTH = 60;

export class ClaudeCodeProvider extends BaseProvider {
  private cliPath: string;
  private workingDirectory: string;
  private enableTools: boolean;
  private requestTimeout: number;
  private cleanEnv: Record<string, string> | null = null;

  /** Cache: Buuo session ID -> Claude session ID */
  private readonly claudeSessionIds = new Map<string, string>();

  private readonly log = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}]`, '[ClaudeCode]', ...args);
  };

  private readonly logDebug = (...args: unknown[]) => {
    // Enable for debugging:
    // const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    // console.log(`[${timestamp}] [DEBUG]`, '[ClaudeCode]', ...args);
  };

  constructor(id: string = 'claude-code') {
    super(id, 'Claude Code');
    this.cliPath = DEFAULT_CLI_PATH;
    this.workingDirectory = process.cwd();
    this.enableTools = true;
    this.requestTimeout = DEFAULT_TIMEOUT;
  }

  protected async doInitialize(): Promise<void> {
    const config = this._config as ClaudeCodeConfig;

    if (config.cliPath) this.cliPath = config.cliPath;
    if (config.workingDirectory) this.workingDirectory = config.workingDirectory;
    if (config.enableTools !== undefined) this.enableTools = config.enableTools;
    if (config.requestTimeout !== undefined) this.requestTimeout = config.requestTimeout;

    this._status = {
      available: true,
      state: 'ready',
      model: 'claude-code',
    };

    this.log(`Initialized (timeout: ${this.requestTimeout}ms, tools: ${this.enableTools})`);
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
    const buuoSessionId = request.sessionId || 'default';

    // Get or create Claude session ID
    let claudeSessionId = this.claudeSessionIds.get(buuoSessionId);
    const isFirstMessage = !claudeSessionId;

    if (isFirstMessage) {
      claudeSessionId = uuidv4();
      this.claudeSessionIds.set(buuoSessionId, claudeSessionId);
      this.log(`New session: ${buuoSessionId} -> ${claudeSessionId}`);
    } else {
      this.logDebug(`Resume session: ${buuoSessionId} -> ${claudeSessionId}`);
    }

    // Build current message only (no history)
    const currentMessage = this.buildCurrentMessage(request);

    // Build CLI arguments
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode', 'auto',
      isFirstMessage ? '--session-id' : '--resume',
      claudeSessionId!,
    ];

    if (!this.enableTools) {
      args.push('--allowed-tools', '');
    }

    // Spawn Claude CLI process
    const childProcess = this.spawnProcess(args);
    this.log(`Spawned PID=${childProcess.pid}, mode=${isFirstMessage ? 'new' : 'resume'}`);

    // Send message to stdin
    this.writeStdin(childProcess, currentMessage);

    // Stream response
    yield* this.streamResponse(childProcess, buuoSessionId);
  }

  /** Spawn Claude CLI process with configured environment */
  private spawnProcess(args: string[]): ChildProcess {
    try {
      return spawn(this.cliPath, args, {
        cwd: this.workingDirectory,
        env: this.getCleanEnvironment(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(`Failed to start Claude CLI: ${error}`);
    }
  }

  /** Write message to process stdin and close */
  private writeStdin(process: ChildProcess, message: string): void {
    if (process.stdin) {
      process.stdin.write(message);
      process.stdin.end();
    }
  }

  /** Stream response from child process */
  private async *streamResponse(
    process: ChildProcess,
    sessionId: string
  ): AsyncIterable<ChatResponse> {
    const messageQueue: (ChatResponse | Error)[] = [];
    let resolveWait: (() => void) | null = null;
    let isDone = false;
    let hasReceivedData = false;
    let buffer = '';

    const enqueue = (msg: ChatResponse | Error) => {
      if (!(msg instanceof Error) || !isDone) {
        messageQueue.push(msg);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
    };

    // Setup stdout handler
    process.stdout?.on('data', (data: Buffer) => {
      hasReceivedData = true;
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.parseMessageLine(line, enqueue);
        }
      }
    });

    // Setup stderr handler
    process.stderr?.on('data', (data: Buffer) => {
      const stderr = data.toString();
      if (stderr.trim()) {
        this.log(`Stderr: ${stderr.substring(0, MAX_LOG_LENGTH)}`);
      }
      if (stderr.includes('Error:') || stderr.includes('error:')) {
        enqueue(new Error(`Claude CLI error: ${stderr.substring(0, MAX_LOG_LENGTH * 2)}`));
      }
    });

    // Setup close handler
    process.on('close', (code: number | null) => {
      if (!hasReceivedData && code !== 0) {
        enqueue(new Error(`Claude CLI failed (exit code: ${code})`));
      }
      isDone = true;
      enqueue({ done: true });
    });

    // Setup error handler
    process.on('error', (err: Error) => {
      enqueue(new Error(`Claude CLI process error: ${err.message}`));
      isDone = true;
      enqueue({ done: true });
    });

    // Setup timeout
    const timeoutId = setTimeout(() => {
      this.log(`Timeout: ${sessionId}`);
      if (!process.killed) {
        process.kill('SIGTERM');
      }
    }, this.requestTimeout);

    // Yield messages from queue
    let yieldedCount = 0;
    const startTime = Date.now();

    try {
      while (!isDone || messageQueue.length > 0) {
        // Check timeout periodically
        if (yieldedCount % 10 === 0 && Date.now() - startTime > this.requestTimeout) {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
          throw new Error(`Request timeout after ${this.requestTimeout}ms`);
        }

        const msg = messageQueue.shift();
        if (msg) {
          if (msg instanceof Error) throw msg;
          yieldedCount++;
          yield msg;
          if (msg.done) break;
        } else if (!isDone) {
          // Wait for new messages
          await new Promise<void>(resolve => {
            resolveWait = resolve;
            setTimeout(resolve, POLL_INTERVAL);
          });
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    this.log(`Complete: ${yieldedCount} messages, PID=${process.pid}`);
  }

  /** Get or create clean environment (cached) */
  private getCleanEnvironment(): Record<string, string> {
    if (this.cleanEnv) {
      return this.cleanEnv;
    }

    const cleanEnv: Record<string, string> = {};
    const excludedKeys = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT'];

    for (const [key, value] of Object.entries(process.env)) {
      if (!excludedKeys.includes(key) && value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    this.cleanEnv = cleanEnv;
    return cleanEnv;
  }

  /** Parse JSON message line from Claude CLI */
  private parseMessageLine(
    line: string,
    enqueue: (msg: ChatResponse | Error) => void
  ): void {
    try {
      const message = JSON.parse(line);

      switch (message.type) {
        case 'assistant':
          this.handleAssistantMessage(message, enqueue);
          break;
        case 'stream_event':
          this.handleStreamEvent(message, enqueue);
          break;
        case 'result':
          this.handleResultMessage(message, enqueue);
          break;
        case 'error':
          enqueue(new Error(message.error || message.message || 'Unknown error from Claude CLI'));
          break;
        default:
          if (message.is_error) {
            enqueue(new Error(message.error || message.message || 'Unknown error from Claude CLI'));
          }
      }
    } catch {
      // Ignore JSON parse errors for non-JSON lines
    }
  }

  /** Handle assistant message type */
  private handleAssistantMessage(
    message: any,
    enqueue: (msg: ChatResponse | Error) => void
  ): void {
    if (!message.message?.content) return;

    for (const item of message.message.content) {
      switch (item.type) {
        case 'text':
          if (item.text) {
            enqueue({ content: item.text, done: false });
          }
          break;
        case 'tool_use':
          enqueue({
            done: false,
            thinking: {
              type: 'tool_use',
              name: item.name || 'tool',
              input: this.formatToolInput(item.input),
            },
          });
          break;
        case 'thinking':
          const thinkingText = item.thinking || '';
          const truncated = thinkingText.length > 200
            ? thinkingText.slice(0, 200) + '...'
            : thinkingText;
          enqueue({
            done: false,
            thinking: { type: 'thinking', content: truncated },
          });
          break;
      }
    }
  }

  /** Handle stream event type */
  private handleStreamEvent(
    message: any,
    enqueue: (msg: ChatResponse | Error) => void
  ): void {
    const eventType = message.event?.type;

    if (eventType === 'message_start') {
      enqueue({
        done: false,
        thinking: { type: 'thinking', content: 'Connected to Claude...' },
      });
    } else if (eventType === 'content_block_start') {
      enqueue({
        done: false,
        thinking: { type: 'thinking', content: 'Thinking...' },
      });
    } else if (eventType === 'message_delta' && message.event?.usage) {
      enqueue({
        done: false,
        usage: {
          promptTokens: message.event.usage.input_tokens || 0,
          completionTokens: message.event.usage.output_tokens || 0,
          totalTokens: (message.event.usage.input_tokens || 0) +
                       (message.event.usage.output_tokens || 0),
        },
      });
    }
  }

  /** Handle result message type */
  private handleResultMessage(
    message: any,
    enqueue: (msg: ChatResponse | Error) => void
  ): void {
    if (message.usage) {
      enqueue({
        done: false,
        usage: {
          promptTokens: message.usage.input_tokens || 0,
          completionTokens: message.usage.output_tokens || 0,
          totalTokens: (message.usage.input_tokens || 0) +
                       (message.usage.output_tokens || 0),
        },
      });
    }
  }

  /** Format tool input for display */
  private formatToolInput(input: unknown): string {
    if (!input) return '';
    if (typeof input === 'string') {
      return input.length > MAX_TOOL_INPUT_LENGTH
        ? input.slice(0, MAX_TOOL_INPUT_LENGTH) + '...'
        : input;
    }
    if (typeof input !== 'object' || input === null) {
      return String(input);
    }

    const obj = input as Record<string, unknown>;

    if (obj.file) {
      const file = String(obj.file);
      return file.length > MAX_IMAGE_PATH_LENGTH
        ? `📄 ${file.slice(0, 30)}...`
        : `📄 ${file}`;
    }
    if (obj.query) {
      const query = String(obj.query);
      return `🔍 "${query.slice(0, 40)}..."`;
    }
    if (obj.path) {
      const path = String(obj.path);
      if (path.length > MAX_IMAGE_PATH_LENGTH) {
        const parts = path.split('/');
        return `📁 ...${parts.slice(-2).join('/')}`;
      }
      return `📁 ${path}`;
    }

    const keys = Object.keys(obj).slice(0, 2);
    return keys.length > 2
      ? `{${keys.join(', ')}, ...}`
      : JSON.stringify(obj).slice(0, 80);
  }

  /** Build current message (only latest message, no history) */
  private buildCurrentMessage(request: ChatRequest): string {
    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage) {
      return '';
    }

    let userContent = lastMessage.content || '';
    const attachments = (lastMessage.metadata?.attachments as Array<{ type: string; url?: string; metadata?: { platform?: string } }>) || [];

    // Process image attachments
    const hasImages = attachments.some(a => a.type === 'image');
    if (hasImages) {
      const imageRefs = attachments
        .filter(a => a.type === 'image')
        .map(a => this.formatImageAttachment(a))
        .join(' ');

      userContent = imageRefs ? `${userContent} ${imageRefs}`.trim() : userContent;
    }

    return userContent;
  }

  /** Format image attachment for Claude Code */
  private formatImageAttachment(
    attachment: { url?: string; metadata?: { platform?: string } }
  ): string {
    const imageUrl = attachment.url || '';
    const metadata = attachment.metadata || {};

    if (!imageUrl && metadata.platform === 'lark') {
      return '(Lark image received. Please describe the image content for analysis.)';
    }

    if (imageUrl.startsWith('/') || imageUrl.startsWith('./')) {
      return `[Image: file://${imageUrl}]`;
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return `[Image: ${imageUrl}]`;
    }

    return '(Image received but cannot be displayed)';
  }

  /** Clear cached session ID (for session reset) */
  clearSession(buuoSessionId: string): void {
    this.claudeSessionIds.delete(buuoSessionId);
    this.log(`Cleared session: ${buuoSessionId}`);
  }

  /** Get number of cached sessions */
  getCachedSessionCount(): number {
    return this.claudeSessionIds.size;
  }

  /** Get all cached session mappings (copy) */
  getSessionMappings(): Map<string, string> {
    return new Map(this.claudeSessionIds);
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async cleanup(): Promise<void> {
    this.claudeSessionIds.clear();
    this.log('Cleanup complete');
  }
}
