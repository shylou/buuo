/**
 * Agent SDK Provider
 *
 * Uses Anthropic's Agent SDK for real-time bidirectional conversation.
 * - Maintains conversation state automatically
 * - Supports tool use with agent loop
 * - Streams responses in real-time
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  ProviderConfig,
  ChatRequest,
  ChatResponse,
} from '@buuo/core/providers';
import { BaseProvider } from '@buuo/core/providers';

export interface AgentSDKConfig extends ProviderConfig {
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Working directory for Claude Code (default: process.cwd()) */
  workingDirectory?: string;
  /** Request timeout in milliseconds (default: 300000 = 5 minutes) */
  requestTimeout?: number;
  /** Enable file checkpointing */
  enableFileCheckpointing?: boolean;
  /** List of tool names to auto-allow */
  allowedTools?: string[];
  /** List of specific tools to make available */
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
}

/** Constants for configuration */
const DEFAULT_TIMEOUT = 300000;
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

export class AgentSDKProvider extends BaseProvider {
  private model: string;
  private workingDirectory: string;
  private requestTimeout: number;
  private enableFileCheckpointing: boolean;
  private allowedTools: string[];
  private tools?: string[] | { type: 'preset'; preset: 'claude_code' };

  /** Cache: Buuo session ID -> Agent SDK session ID */
  private readonly sessionMappings = new Map<string, string>();

  /** Cache: Buuo session ID -> expiry timestamp */
  private readonly sessionExpiry = new Map<string, number>();

  /** Active abort controllers for cancellation */
  private readonly activeControllers = new Map<string, AbortController>();

  /** Active Query objects for graceful cancellation */
  private readonly activeQueries = new Map<string, Awaited<ReturnType<typeof query>>>();

  /** Track sessions that have been cancelled */
  private readonly cancelledSessions = new Set<string>();

  /** Cleanup interval timer */
  private cleanupTimer?: NodeJS.Timeout;

  private readonly log = (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}]`, '[AgentSDK]', ...args);
  };


  constructor(id: string = 'agent-sdk') {
    super(id, 'Agent SDK');
    this.model = DEFAULT_MODEL;
    this.workingDirectory = process.cwd();
    this.requestTimeout = DEFAULT_TIMEOUT;
    this.enableFileCheckpointing = false;
    this.allowedTools = [];
  }

  protected async doInitialize(): Promise<void> {
    const config = this._config as AgentSDKConfig;

    if (config.model) this.model = config.model;
    if (config.workingDirectory) this.workingDirectory = config.workingDirectory;
    if (config.requestTimeout !== undefined) this.requestTimeout = config.requestTimeout;
    if (config.enableFileCheckpointing !== undefined) this.enableFileCheckpointing = config.enableFileCheckpointing;
    if (config.allowedTools) this.allowedTools = config.allowedTools;
    if (config.tools) this.tools = config.tools;

    this._status = {
      available: true,
      state: 'ready',
      model: this.model,
    };

    // Start periodic session cleanup
    this.startSessionCleanup();

    const toolsInfo = this.tools ? 'custom tools' : this.allowedTools.length > 0 ? `${this.allowedTools.length} allowed` : 'default';
    this.log(`Initialized (model: ${this.model}, timeout: ${this.requestTimeout}ms, tools: ${toolsInfo}, dir: ${this.workingDirectory})`);
  }

  /** Start periodic cleanup of expired sessions */
  private startSessionCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL);
  }

  /** Clean up expired sessions */
  private cleanExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [buuoSessionId, expiry] of this.sessionExpiry) {
      if (expiry < now) {
        this.sessionMappings.delete(buuoSessionId);
        this.sessionExpiry.delete(buuoSessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.log(`Cleaned ${cleanedCount} expired sessions`);
    }
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

    // Get or create session ID
    const agentSessionId = this.sessionMappings.get(buuoSessionId);
    const isFirstMessage = !agentSessionId;

    if (isFirstMessage) {
      this.log(`New session: ${buuoSessionId}`);
    } else {
      // Update expiry time for existing session on activity
      this.sessionExpiry.set(buuoSessionId, Date.now() + SESSION_TTL);
    }

    // Get user message
    const userMessage = request.messages[request.messages.length - 1];
    if (!userMessage) {
      this.log(`No user message found`);
      return;
    }

    // Build query options
    const options: Record<string, unknown> = {
      cwd: this.workingDirectory,
      enableFileCheckpointing: this.enableFileCheckpointing,
      // Enable loading MCP servers and project-level settings
      settingSources: ['user', 'project'],
    };

    // Resume existing session
    if (agentSessionId) {
      options.resume = agentSessionId;
    }

    // Add model parameter (skip if "default" to let Agent SDK use its own default)
    const effectiveModel = request.model || this.model;
    if (effectiveModel !== 'default') {
      options.model = effectiveModel;
    }

    // Configure tools
    if (this.allowedTools.length > 0) {
      options.allowedTools = this.allowedTools;
    }
    if (this.tools) {
      options.tools = this.tools;
    }

    // Forward system prompt
    if (request.systemPrompt) {
      options.systemPrompt = request.systemPrompt;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    this.activeControllers.set(buuoSessionId, abortController);
    options.abortController = abortController;

    // Build prompt
    let prompt = userMessage.content || '';
    this.log(`User message: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);

    // Process image attachments
    const attachments = (userMessage.metadata?.attachments as Array<{
      type: string;
      url?: string;
      metadata?: { platform?: string };
    }>) || [];

    const hasImages = attachments.some(a => a.type === 'image');
    if (hasImages) {
      const imageRefs = attachments
        .filter(a => a.type === 'image')
        .map(a => this.formatImageAttachment(a))
        .join(' ');
      prompt = imageRefs ? `${prompt} ${imageRefs}`.trim() : prompt;
    }

    try {
      // Call Agent SDK query function
      const queryGenerator = query({ prompt, options });

      // Store Query object for graceful cancellation
      this.activeQueries.set(buuoSessionId, queryGenerator as any);

      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.log(`Timeout: ${buuoSessionId}`);
        abortController.abort();
      }, this.requestTimeout);

      // Stream responses
      let messageCount = 0;
      try {
        for await (const message of queryGenerator) {
          messageCount++;
          const response = this.convertSDKMessageToChatResponse(message);

          if (response) {
            yield response;

            // Save session ID from first message
            if (isFirstMessage && message.session_id) {
              this.sessionMappings.set(buuoSessionId, message.session_id);
              this.sessionExpiry.set(buuoSessionId, Date.now() + SESSION_TTL);
              this.log(`Session created: ${buuoSessionId} -> ${message.session_id}`);
            }

            // Check if done
            if (response.done) {
              break;
            }
          }
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (abortController.signal.aborted) {
          const isTimeout = this.cancelledSessions.has(buuoSessionId) === false;
          if (isTimeout) {
            // Timeout — notify user before ending stream
            this.log(`Stream aborted (timeout): ${errMsg.substring(0, 100)}`);
            yield {
              content: '⏱️ Request timed out. The operation took too long and was automatically cancelled. Please try again or simplify your request.',
              done: true,
            };
          } else {
            // Cancelled by user — end stream gracefully
            this.log(`Stream aborted (user cancel): ${errMsg.substring(0, 100)}`);
          }
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timeoutId);
      }

      this.log(`Complete: ${messageCount} messages`);
    } finally {
      // Always remove from active controllers and queries
      this.activeControllers.delete(buuoSessionId);
      this.activeQueries.delete(buuoSessionId);
      this.cancelledSessions.delete(buuoSessionId);
    }
  }

  /** Convert SDK message to ChatResponse */
  private convertSDKMessageToChatResponse(message: SDKMessage): ChatResponse | null {
    const msgType = (message as { type: string }).type;

    if (msgType === 'assistant') {
      return this.handleAssistantMessage(message as any);
    }

    if (msgType === 'system') {
      return this.handleSystemMessage(message as any);
    }

    if (msgType === 'stream_event') {
      return this.handleStreamEvent(message as any);
    }

    if (msgType === 'result') {
      return this.handleResultMessage(message as any);
    }

    // These message types are handled internally or don't need to be forwarded
    const ignoredTypes = [
      'user',
      'user_message_replay',
      'system',
      'compact_boundary',
      'status',
      'local_command_output',
      'hook_started',
      'hook_progress',
      'hook_response',
      'tool_progress',
      'auth_status',
      'task_notification',
      'task_started',
      'task_progress',
      'files_persisted',
      'tool_use_summary',
      'rate_limit',
      'elicitation_complete',
      'prompt_suggestion',
    ];

    if (ignoredTypes.includes(msgType)) {
      return null;
    }

    // Log unhandled message types for debugging
    this.log(`Unhandled message type: ${msgType}`);
    return null;
  }

  /** Handle assistant message */
  private handleAssistantMessage(message: any): ChatResponse | null {
    if (!message.message?.content) return null;

    // Check content blocks for different types
    for (const item of message.message.content) {
      if (item.type === 'text' && item.text) {
        return { content: item.text, done: false };
      }
      // Check for thinking content (some SDK versions may include this)
      if (item.type === 'thinking' && item.thinking) {
        return {
          done: false,
          thinking: { type: 'thinking', content: item.thinking }
        };
      }
    }

    return null;
  }

  /** Handle system message - log model and permission info */
  private handleSystemMessage(message: any): ChatResponse | null {
    // Log system message details for debugging
    if (message.model) {
      this.log(`[SYSTEM] Model: ${message.model}`);
    }
    if (message.permissionMode) {
      this.log(`[SYSTEM] Permission mode: ${message.permissionMode}`);
    }
    // System messages are internal, don't forward to user
    return null;
  }

  /** Handle stream event */
  private handleStreamEvent(message: any): ChatResponse | null {
    const eventType = message.event?.type;

    if (eventType === 'message_start') {
      return {
        done: false,
        thinking: { type: 'thinking', content: 'Connected to Claude...' },
      };
    }

    if (eventType === 'content_block_start') {
      return {
        done: false,
        thinking: { type: 'thinking', content: 'Thinking...' },
      };
    }

    if (eventType === 'content_block_delta') {
      if (message.event.delta?.type === 'text_delta') {
        return { content: message.event.delta.text, done: false };
      }
    }

    if (eventType === 'message_delta' && message.event.usage) {
      return {
        done: false,
        usage: {
          promptTokens: message.event.usage.input_tokens || 0,
          completionTokens: message.event.usage.output_tokens || 0,
          totalTokens: (message.event.usage.input_tokens || 0) +
                       (message.event.usage.output_tokens || 0),
        },
      };
    }

    if (eventType === 'message_stop') {
      return { done: true };
    }

    return null;
  }

  /** Handle result message */
  private handleResultMessage(message: any): ChatResponse | null {
    if (message.usage) {
      return {
        done: true,
        usage: {
          promptTokens: message.usage.input_tokens || 0,
          completionTokens: message.usage.output_tokens || 0,
          totalTokens: (message.usage.input_tokens || 0) +
                       (message.usage.output_tokens || 0),
        },
      };
    }

    return { done: true };
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
    this.sessionMappings.delete(buuoSessionId);
    this.sessionExpiry.delete(buuoSessionId);
    this.log(`Cleared session: ${buuoSessionId}`);
  }

  /** Get number of cached sessions */
  getCachedSessionCount(): number {
    return this.sessionMappings.size;
  }

  /** Get all cached session mappings (copy) */
  getSessionMappings(): Map<string, string> {
    return new Map(this.sessionMappings);
  }

  /**
   * Cancel an active request for a session (synchronous)
   * Returns boolean directly so callers can branch on the result.
   * Uses AbortController for immediate cancellation; interrupt is fire-and-forget.
   * @returns true if request was found and cancellation attempted
   */
  cancelRequest(buuoSessionId: string): boolean {
    const controller = this.activeControllers.get(buuoSessionId);
    const queryObj = this.activeQueries.get(buuoSessionId);

    if (!controller && !queryObj) {
      return false;
    }

    this.log(`Cancelling request for session: ${buuoSessionId}`);

    // Mark as cancelled so doChatStream knows to suppress errors
    this.cancelledSessions.add(buuoSessionId);

    // Abort immediately (synchronous)
    if (controller) {
      controller.abort();
    }

    // Fire-and-forget graceful interrupt
    if (queryObj) {
      queryObj.interrupt().catch((err: unknown) => {
        this.log(`Error interrupting query: ${err}`);
      });
    }

    this.activeControllers.delete(buuoSessionId);
    this.activeQueries.delete(buuoSessionId);
    return true;
  }

  /** Check if a session has an active request */
  hasActiveRequest(buuoSessionId: string): boolean {
    return this.activeQueries.has(buuoSessionId);
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async cleanup(): Promise<void> {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Abort all active requests
    for (const [sessionId, controller] of this.activeControllers) {
      this.log(`Aborting active request for session: ${sessionId}`);
      controller.abort();
    }
    this.activeControllers.clear();

    // Clear all caches
    this.sessionMappings.clear();
    this.sessionExpiry.clear();
    this.cancelledSessions.clear();
    this.log('Cleanup complete');
  }
}
