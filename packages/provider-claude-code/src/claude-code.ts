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
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  requestTimeout?: number;
}

export class ClaudeCodeProvider extends BaseProvider {
  private cliPath: string;
  private workingDirectory: string;
  private enableTools: boolean;
  private requestTimeout: number;
  private cleanEnv: Record<string, string> | null = null;

  private log = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}]`, ...args);
  };

  private logDebug = (...args: unknown[]) => {
    // Uncomment to enable debug logging:
    // const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    // console.log(`[${timestamp}] [DEBUG]`, ...args);
  };

  constructor(id: string = 'claude-code') {
    super(id, 'Claude Code');
    this.cliPath = 'claude';
    this.workingDirectory = process.cwd();
    this.enableTools = true;
    this.requestTimeout = 300000;
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
      model: 'claude-code-local',
    };

    this.log(`[ClaudeCodeProvider] Initialized (request timeout: ${this.requestTimeout}ms)`);
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
    const cliSessionId = this.generateSessionId();
    const prompt = this.buildPrompt(request);

    this.logDebug(`[ClaudeCodeProvider] Request: ${buuoSessionId} -> ${cliSessionId}`);
    this.logDebug(`[ClaudeCodeProvider] Prompt length: ${prompt.length} chars, messages: ${request.messages.length}`);

    // Build CLI arguments
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--no-session-persistence',
      '--session-id', cliSessionId,
      '--permission-mode', 'auto',
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
        stdio: ['pipe', 'pipe', 'pipe'],  // Use pipe for stdin to send prompt
      });
      this.log(`[ClaudeCodeProvider] Spawned: PID=${childProcess.pid}`);

      // Write prompt to stdin
      if (childProcess.stdin) {
        childProcess.stdin.write(prompt);
        childProcess.stdin.end();
      }
    } catch (error) {
      throw new Error(`Failed to start Claude CLI: ${error}`);
    }

    // Setup request timeout
    const timeoutId = setTimeout(() => {
      this.log(`[ClaudeCodeProvider] Timeout: ${buuoSessionId}`);
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    }, this.requestTimeout);

    // Message queue for async handling
    const messageQueue: (ChatResponse | Error | null)[] = [];
    let resolveWait: (() => void) | null = null;
    let isDone = false;
    let hasReceivedData = false;

    const enqueue = (msg: ChatResponse | Error | null) => {
      const isDoneSignal = msg && !(msg instanceof Error) && msg.done === true;
      if (msg && (isDoneSignal || !isDone)) {
        messageQueue.push(msg);
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
      // Log all stderr for debugging
      if (stderr.trim()) {
        this.log(`[ClaudeCodeProvider] Stderr: ${stderr.substring(0, 200)}`);
      }
      if (stderr.includes('Error:') || stderr.includes('error:')) {
        enqueue(new Error(`Claude CLI error: ${stderr.substring(0, 500)}`));
      }
    });

    // Track request start time
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

    // Yield messages from queue
    let yieldedCount = 0;

    while (!isDone || messageQueue.length > 0) {
      if (yieldedCount % 10 === 0) {
        if (Date.now() - startTime > this.requestTimeout) {
          if (childProcess && !childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
          throw new Error(`Request timeout after ${this.requestTimeout}ms`);
        }
      }

      if (messageQueue.length === 0 && !isDone) {
        await new Promise<void>(resolve => {
          resolveWait = resolve;
          setTimeout(resolve, 50);
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

    // Cleanup
    clearTimeout(timeoutId);

    this.log(`[ClaudeCodeProvider] Complete: ${yieldedCount} messages, PID=${childProcess.pid}`);
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
              } else if (item.type === 'tool_use') {
                // Capture tool use for thinking process display
                enqueue({
                  done: false,
                  thinking: {
                    type: 'tool_use',
                    name: item.name || 'tool',
                    input: this.formatToolInput(item.input)
                  }
                });
              } else if (item.type === 'thinking') {
                // Capture thinking blocks - compact format
                const thinkingText = item.thinking || '';
                const truncated = thinkingText.length > 200 ? thinkingText.substring(0, 200) + '...' : thinkingText;
                enqueue({
                  done: false,
                  thinking: {
                    type: 'thinking',
                    content: truncated
                  }
                });
              }
            }
          }
          break;

        case 'stream_event':
          // Handle message_start - immediate feedback
          if (message.event?.type === 'message_start') {
            enqueue({
              done: false,
              thinking: {
                type: 'thinking',
                content: 'Connected to Claude...'
              }
            });
            break;
          }
          // Handle content_block_start - actual content is coming
          if (message.event?.type === 'content_block_start') {
            enqueue({
              done: false,
              thinking: {
                type: 'thinking',
                content: 'Thinking...'
              }
            });
            break;
          }
          // Handle usage info
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

  /**
   * Format tool input for display
   */
  private formatToolInput(input: any): string {
    if (!input) return '';

    if (typeof input === 'string') {
      return input.length > 100 ? input.substring(0, 100) + '...' : input;
    }

    // Smart format for common types
    if (input.file) {
      const file = input.file as string;
      return file.length > 60 ? `📄 ${file.substring(0, 30)}...` : `📄 ${file}`;
    }
    if (input.query) {
      const query = input.query as string;
      return `🔍 "${query.substring(0, 40)}..."`;
    }
    if (input.path) {
      const path = input.path as string;
      if (path.length > 60) {
        const parts = path.split('/');
        return `📁 ...${parts.slice(-2).join('/')}`;
      }
      return `📁 ${path}`;
    }

    // Default: compact object representation
    const keys = Object.keys(input).slice(0, 2);
    return keys.length > 2 ? `{${keys.join(', ')}, ...}` : JSON.stringify(input).substring(0, 80);
  }

  private generateSessionId(): string {
    return uuidv4();
  }

  private buildPrompt(request: ChatRequest): string {
    let prompt = '';

    if (request.systemPrompt) {
      prompt += `System: ${request.systemPrompt}\n\n`;
    }

    // Find the latest image-only message (will be the current one if user sent image)
    let latestImageOnlyMsgIndex = -1;
    for (let i = request.messages.length - 1; i >= 0; i--) {
      const msg = request.messages[i];
      if (msg.role === 'user') {
        const attachments = (msg.metadata?.attachments as any[]) || [];
        const hasImage = attachments.some(a => a.type === 'image');
        const content = msg.content || '';
        if (hasImage && (!content || content === '[图片]' || content === '[图片] ')) {
          latestImageOnlyMsgIndex = i;
          break; // Found the latest one
        }
      }
    }

    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i];
      switch (msg.role) {
        case 'system':
          prompt += `System: ${msg.content}\n\n`;
          break;
        case 'user':
          // Check for image attachments (stored in metadata)
          const attachments = (msg.metadata?.attachments as any[]) || [];
          let userContent = msg.content || '';
          const hasImageAttachments = attachments.some(a => a.type === 'image');

          // Skip historical pure image messages (only keep the latest one)
          if (hasImageAttachments && (!userContent || userContent === '[图片]' || userContent === '[图片] ')) {
            if (i !== latestImageOnlyMsgIndex) {
              // Skip historical pure image messages
              continue;
            }
          }

          if (hasImageAttachments) {
            // Process image attachments for messages with actual content
            for (const attachment of attachments) {
              if (attachment.type === 'image') {
                const imageRef = this.formatImageAttachment(attachment);
                // Add separator if content exists
                if (userContent) {
                  userContent += ' ' + imageRef;
                } else {
                  userContent = imageRef;
                }
              }
            }
          }

          // Only add user message if there's content
          if (userContent.trim()) {
            prompt += `User: ${userContent}\n\n`;
          }
          break;
        case 'assistant':
          prompt += `Assistant: ${msg.content}\n\n`;
          break;
        case 'tool':
          prompt += `Tool Result: ${msg.content}\n\n`;
          break;
      }
    }

    const finalPrompt = prompt.trim();
    // Debug log (disabled by default for cleaner output)
    this.logDebug(`[ClaudeCodeProvider] Prompt content:\n${finalPrompt.substring(0, 500)}${finalPrompt.length > 500 ? '...' : ''}`);

    return finalPrompt;
  }

  /**
   * Format image attachment for Claude Code
   * Converts image URL/reference to format Claude can understand
   */
  private formatImageAttachment(attachment: any): string {
    const imageUrl = attachment.url || '';
    const metadata = attachment.metadata || {};

    // For Lark images with no URL, provide helpful instruction
    if (!imageUrl && metadata.platform === 'lark') {
      return '(收到飞书图片，但我无法直接查看。请描述图片内容，我会帮你分析)';
    }

    // Handle local file paths
    if (imageUrl && (imageUrl.startsWith('/') || imageUrl.startsWith('./'))) {
      return `[Image: file://${imageUrl}]`;
    }

    // Handle web URLs
    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
      return `[Image: ${imageUrl}]`;
    }

    // Default
    return '(收到图片，但我无法查看)';
  }

  async cleanup(): Promise<void> {
    this.log('[ClaudeCodeProvider] Cleanup complete');
  }
}
