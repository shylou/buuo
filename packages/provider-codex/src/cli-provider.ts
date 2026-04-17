import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import type {
  ChatRequest,
  ChatResponse,
  ProviderConfig,
} from '@buuo/core/providers';
import { BaseProvider } from '@buuo/core/providers';

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
}

interface CodexItem {
  id?: string;
  type?: string;
  status?: string;
  text?: string;
  command?: string;
  server?: string;
  tool?: string;
  query?: string;
}

interface CodexJsonEvent {
  type: string;
  thread_id?: string;
  usage?: CodexUsage;
  error?: { message?: string } | string;
  message?: string;
  item?: CodexItem;
}

export interface CodexCliConfig extends ProviderConfig {
  cliPath?: string;
  workingDirectory?: string;
  requestTimeout?: number;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  fullAuto?: boolean;
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  skipGitRepoCheck?: boolean;
  profile?: string;
  ephemeral?: boolean;
  configOverrides?: string[];
}

const DEFAULT_TIMEOUT = 300000;
const DEFAULT_CLI_PATH = 'codex';
const DEFAULT_MODEL = 'gpt-5.4';
const DEFAULT_SANDBOX = 'workspace-write';
const POLL_INTERVAL = 50;
const MAX_STDERR_LENGTH = 4000;
const MAX_LOG_LENGTH = 200;
const MAX_REASONING_LENGTH = 200;
const MAX_TOOL_INPUT_LENGTH = 120;
const SESSION_TTL = 24 * 60 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000;
const CANCEL_FORCE_KILL_TIMEOUT = 2500;

export class CodexCliProvider extends BaseProvider {
  private cliPath = DEFAULT_CLI_PATH;
  private workingDirectory = process.cwd();
  private requestTimeout = DEFAULT_TIMEOUT;
  private model = DEFAULT_MODEL;
  private sandbox: 'read-only' | 'workspace-write' | 'danger-full-access' = DEFAULT_SANDBOX;
  private fullAuto = true;
  private dangerouslyBypassApprovalsAndSandbox = false;
  private skipGitRepoCheck = false;
  private profile?: string;
  private ephemeral = false;
  private configOverrides: string[] = [];

  private readonly sessionMappings = new Map<string, string>();
  private readonly sessionExpiry = new Map<string, number>();
  private readonly activeProcesses = new Map<string, ChildProcess>();
  private readonly cancelledSessions = new Set<string>();
  private cleanupTimer?: NodeJS.Timeout;

  private readonly log = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}]`, '[CodexCli]', ...args);
  };

  private readonly logDebug = (..._args: unknown[]) => {
    // No-op until centralized logging is integrated.
  };

  constructor(id: string = 'codex-cli') {
    super(id, 'Codex CLI');
  }

  protected async doInitialize(): Promise<void> {
    const config = this._config as CodexCliConfig;

    if (config.cliPath) this.cliPath = config.cliPath;
    if (config.workingDirectory) this.workingDirectory = config.workingDirectory;
    if (config.requestTimeout !== undefined) this.requestTimeout = config.requestTimeout;
    if (config.model) this.model = config.model;
    if (config.sandbox) this.sandbox = config.sandbox;
    if (config.fullAuto !== undefined) this.fullAuto = config.fullAuto;
    if (config.dangerouslyBypassApprovalsAndSandbox !== undefined) {
      this.dangerouslyBypassApprovalsAndSandbox = config.dangerouslyBypassApprovalsAndSandbox;
    }
    if (config.skipGitRepoCheck !== undefined) this.skipGitRepoCheck = config.skipGitRepoCheck;
    if (config.profile) this.profile = config.profile;
    if (config.ephemeral !== undefined) this.ephemeral = config.ephemeral;
    if (config.configOverrides) this.configOverrides = [...config.configOverrides];

    await mkdir(this.workingDirectory, { recursive: true });
    this.checkCliAvailable();
    this.startSessionCleanup();

    this._status = {
      available: true,
      state: 'ready',
      model: this.model,
    };

    this.log(
      `Initialized (model: ${this.model}, timeout: ${this.requestTimeout}ms, dir: ${this.workingDirectory})`
    );
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
    const threadId = this.sessionMappings.get(buuoSessionId);
    const prompt = this.buildPrompt(request);
    const args = threadId
      ? this.buildResumeArgs(prompt, threadId, request.model)
      : this.buildExecArgs(prompt, request.model);

    this.sessionExpiry.set(buuoSessionId, Date.now() + SESSION_TTL);
    this.log(`User message: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);

    const childProcess = this.spawnProcess(args);
    this.activeProcesses.set(buuoSessionId, childProcess);
    this.log(`Spawned PID=${childProcess.pid}, mode=${threadId ? 'resume' : 'new'}`);

    try {
      yield* this.streamResponse(childProcess, buuoSessionId);
      this.cancelledSessions.delete(buuoSessionId);
    } finally {
      this.activeProcesses.delete(buuoSessionId);
    }
  }

  clearSession(buuoSessionId: string): void {
    this.sessionMappings.delete(buuoSessionId);
    this.sessionExpiry.delete(buuoSessionId);
    this.cancelledSessions.delete(buuoSessionId);
    this.log(`Cleared session: ${buuoSessionId}`);
  }

  getCachedSessionCount(): number {
    return this.sessionMappings.size;
  }

  getSessionMappings(): Map<string, string> {
    return new Map(this.sessionMappings);
  }

  cancelRequest(buuoSessionId: string): boolean {
    const process = this.activeProcesses.get(buuoSessionId);
    if (!process) {
      this.logDebug(`Cancel requested but no active process for session: ${buuoSessionId}`);
      return false;
    }

    if (process.killed) {
      this.activeProcesses.delete(buuoSessionId);
      return false;
    }

    this.cancelledSessions.add(buuoSessionId);
    this.log(`Cancelling request for session: ${buuoSessionId} (PID=${process.pid})`);
    process.kill('SIGTERM');

    let cleanedUp = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      this.activeProcesses.delete(buuoSessionId);
    };

    forceKillTimer = setTimeout(() => {
      if (!process.killed) {
        this.log(`Force killing process for session: ${buuoSessionId} (PID=${process.pid})`);
        process.kill('SIGKILL');
      }
      cleanup();
    }, CANCEL_FORCE_KILL_TIMEOUT);

    if (process.exitCode !== null || process.signalCode !== null) {
      cleanup();
    } else {
      process.once('exit', cleanup);
    }

    return true;
  }

  hasActiveRequest(buuoSessionId: string): boolean {
    const process = this.activeProcesses.get(buuoSessionId);
    return process !== undefined && !process.killed;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async cleanup(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    for (const [sessionId, process] of this.activeProcesses) {
      if (!process.killed) {
        this.log(`Killing active process for session: ${sessionId} (PID=${process.pid})`);
        process.kill('SIGTERM');
      }
    }
    this.activeProcesses.clear();
    this.sessionMappings.clear();
    this.sessionExpiry.clear();
    this.cancelledSessions.clear();
    this.log('Cleanup complete');
  }

  private checkCliAvailable(): void {
    const result = spawnSync(this.cliPath, ['--version'], {
      cwd: this.workingDirectory,
      env: process.env,
      encoding: 'utf8',
    });

    if (result.error && result.status !== 0) {
      if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Codex CLI not found: ${this.cliPath}. Install Codex and complete \`codex login\` on the host machine.`);
      }
      throw new Error(`Failed to check Codex CLI: ${result.error.message}`);
    }

    if (result.status !== 0) {
      throw new Error(`Codex CLI is unavailable (exit code ${result.status}). stderr: ${(result.stderr || '').trim()}`);
    }
  }

  private startSessionCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL);
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();

    for (const [buuoSessionId, expiry] of this.sessionExpiry) {
      if (expiry < now) {
        this.sessionMappings.delete(buuoSessionId);
        this.sessionExpiry.delete(buuoSessionId);
        this.cancelledSessions.delete(buuoSessionId);
      }
    }
  }

  private buildExecArgs(prompt: string, modelOverride?: string): string[] {
    const args = ['exec', '--json'];
    this.appendSharedArgs(args, modelOverride || this.model, false);
    args.push(prompt);
    return args;
  }

  private buildResumeArgs(prompt: string, threadId: string, modelOverride?: string): string[] {
    const args = ['exec', 'resume', '--json'];
    this.appendSharedArgs(args, modelOverride || this.model, true);
    args.push(threadId, prompt);
    return args;
  }

  private appendSharedArgs(args: string[], model: string | undefined, isResume: boolean): void {
    if (model) {
      args.push('--model', model);
    }

    if (!isResume && this.profile) {
      args.push('--profile', this.profile);
    }

    if (this.ephemeral) {
      args.push('--ephemeral');
    }

    if (this.skipGitRepoCheck) {
      args.push('--skip-git-repo-check');
    }

    if (this.dangerouslyBypassApprovalsAndSandbox) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else if (this.fullAuto) {
      args.push('--full-auto');
    } else if (!isResume && this.sandbox) {
      args.push('--sandbox', this.sandbox);
    }

    for (const override of this.configOverrides) {
      args.push('-c', override);
    }
  }

  private buildPrompt(request: ChatRequest): string {
    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage) return '';

    const parts: string[] = [];
    if (request.systemPrompt?.trim()) {
      parts.push(request.systemPrompt.trim());
    }

    let userContent = lastMessage.content || '';
    const attachments = (lastMessage.metadata?.attachments as Array<{ type: string }>) || [];
    if (attachments.some(attachment => attachment.type === 'image')) {
      const note = '[Note: Image attachments were received, but the Codex CLI provider does not yet pass images to Codex.]';
      userContent = userContent ? `${userContent}\n\n${note}` : note;
    }
    if (userContent.trim()) {
      parts.push(userContent.trim());
    }

    return parts.join('\n\n').trim();
  }

  private spawnProcess(args: string[]): ChildProcess {
    try {
      return spawn(this.cliPath, args, {
        cwd: this.workingDirectory,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(`Failed to start Codex CLI: ${error}`);
    }
  }

  private async *streamResponse(
    child: ChildProcess,
    sessionId: string
  ): AsyncIterable<ChatResponse> {
    const messageQueue: (ChatResponse | Error)[] = [];
    let resolveWait: (() => void) | null = null;
    let isClosed = false;
    let buffer = '';
    let stderrBuffer = '';
    let sawTurnComplete = false;

    const enqueue = (msg: ChatResponse | Error) => {
      messageQueue.push(msg);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.parseMessageLine(line, sessionId, enqueue, () => {
            sawTurnComplete = true;
          });
        }
      }
    });

    child.stdout?.on('end', () => {
      if (buffer.trim()) {
        this.parseMessageLine(buffer, sessionId, enqueue, () => {
          sawTurnComplete = true;
        });
        buffer = '';
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const stderr = data.toString();
      if (stderr.trim()) {
        this.log(`Stderr: ${stderr.substring(0, MAX_LOG_LENGTH)}`);
      }
      stderrBuffer = `${stderrBuffer}${stderr}`.slice(-MAX_STDERR_LENGTH);
    });

    child.on('close', (code: number | null) => {
      const isCancelled = this.cancelledSessions.has(sessionId);

      if (!sawTurnComplete && !isCancelled) {
        if (code === 0) {
          enqueue({ done: true });
        } else {
          enqueue(new Error(this.buildProcessError(code, stderrBuffer)));
        }
      }

      isClosed = true;
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    });

    child.on('error', (err: Error) => {
      if (!this.cancelledSessions.has(sessionId)) {
        enqueue(new Error(`Codex CLI process error: ${err.message}`));
      }
      isClosed = true;
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    });

    const timeoutId = setTimeout(() => {
      this.log(`Timeout: ${sessionId}`);
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, this.requestTimeout);

    try {
      while (!isClosed || messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (msg) {
          if (msg instanceof Error) throw msg;
          yield msg;
          if (msg.done) break;
        } else if (!isClosed) {
          await new Promise<void>(resolve => {
            resolveWait = resolve;
            setTimeout(resolve, POLL_INTERVAL);
          });
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseMessageLine(
    line: string,
    sessionId: string,
    enqueue: (msg: ChatResponse | Error) => void,
    markTurnComplete: () => void
  ): void {
    let event: CodexJsonEvent;

    try {
      event = JSON.parse(line) as CodexJsonEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case 'thread.started':
        if (event.thread_id) {
          this.sessionMappings.set(sessionId, event.thread_id);
          this.sessionExpiry.set(sessionId, Date.now() + SESSION_TTL);
          this.log(`Session created: ${sessionId} -> ${event.thread_id}`);
        }
        break;
      case 'turn.started':
        enqueue({
          done: false,
          thinking: { type: 'thinking', content: 'Connected to Codex...' },
        });
        break;
      case 'item.completed':
        if (event.item) {
          this.handleCompletedItem(event.item, enqueue);
        }
        break;
      case 'turn.completed':
        markTurnComplete();
        if (event.usage) {
          enqueue(this.buildUsage(event.usage));
        }
        enqueue({ done: true });
        break;
      case 'turn.failed':
        markTurnComplete();
        enqueue(new Error(this.extractErrorMessage(event) || 'Codex CLI turn failed'));
        break;
      case 'error':
        markTurnComplete();
        enqueue(new Error(this.extractErrorMessage(event) || 'Codex CLI error'));
        break;
      default:
        break;
    }
  }

  private handleCompletedItem(
    item: CodexItem,
    enqueue: (msg: ChatResponse | Error) => void
  ): void {
    switch (item.type) {
      case 'agent_message':
        if (item.text) {
          enqueue({ content: item.text, done: false });
        }
        break;
      case 'reasoning':
        enqueue({
          done: false,
          thinking: {
            type: 'thinking',
            content: this.truncate(item.text || 'Reasoning...', MAX_REASONING_LENGTH),
          },
        });
        break;
      case 'command_execution':
        enqueue({
          done: false,
          thinking: {
            type: 'tool_use',
            name: 'shell',
            input: this.truncate(item.command || 'command', MAX_TOOL_INPUT_LENGTH),
          },
        });
        break;
      case 'mcp_tool_call':
        enqueue({
          done: false,
          thinking: {
            type: 'tool_use',
            name: item.server && item.tool ? `${item.server}/${item.tool}` : 'mcp',
          },
        });
        break;
      case 'web_search':
        enqueue({
          done: false,
          thinking: {
            type: 'tool_use',
            name: 'web_search',
            input: item.query ? this.truncate(item.query, MAX_TOOL_INPUT_LENGTH) : undefined,
          },
        });
        break;
      case 'file_change':
        enqueue({
          done: false,
          thinking: {
            type: 'tool_result',
            content: 'Files updated',
          },
        });
        break;
      default:
        break;
    }
  }

  private buildUsage(usage: CodexUsage): ChatResponse {
    const promptTokens = usage.input_tokens || 0;
    const completionTokens = usage.output_tokens || 0;
    return {
      done: false,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  private buildProcessError(code: number | null, stderrBuffer: string): string {
    const stderr = stderrBuffer.trim();
    const normalized = stderr.toLowerCase();

    if (normalized.includes('login') || normalized.includes('auth') || normalized.includes('unauthorized')) {
      return 'Codex CLI authentication failed. Please run `codex login` on the host machine.';
    }

    if (normalized.includes('git repository') || normalized.includes('git repo')) {
      return 'Codex CLI refused to run outside a Git repository. Set `skipGitRepoCheck: true` if this is intentional.';
    }

    if (normalized.includes('sandbox')) {
      return `Codex CLI sandbox error: ${stderr || `exit code ${code}`}`;
    }

    return stderr
      ? `Codex CLI failed (exit code: ${code}). stderr: ${stderr}`
      : `Codex CLI failed (exit code: ${code})`;
  }

  private extractErrorMessage(event: CodexJsonEvent): string | undefined {
    if (typeof event.error === 'string') return event.error;
    if (event.error?.message) return event.error.message;
    if (event.message) return event.message;
    return undefined;
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
}
