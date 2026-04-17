/**
 * AI Provider Interface - Defines the contract for all AI provider integrations
 * @module providers
 */

export interface AIProvider {
  /** Provider ID */
  id: string;

  /** Provider name */
  name: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Send a chat request (non-streaming)
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Send a chat request (streaming)
   */
  chatStream(request: ChatRequest): AsyncIterable<ChatResponse>;

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number;

  /**
   * Get provider status
   */
  getStatus(): ProviderStatus;

  /**
   * Optional provider-specific cleanup for timers, subprocesses, and cached state
   */
  cleanup?(): Promise<void>;
}

export interface ProviderConfig {
  /** API key */
  apiKey?: string;

  /** Base URL for API */
  baseUrl?: string;

  /** Model identifier */
  model?: string;

  /** Custom options */
  options?: Record<string, unknown>;
}

export interface ChatRequest {
  /** Session ID for context */
  sessionId: string;

  /** Message history */
  messages: ChatMessage[];

  /** System prompt */
  systemPrompt?: string;

  /** Temperature (0.0 - 1.0) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Model identifier (overrides provider default) */
  model?: string;

  /** Tool definitions */
  tools?: ToolDefinition[];

  /** Additional options */
  options?: ProviderChatOptions;
}

export interface ChatMessage {
  /** Message role */
  role: 'system' | 'user' | 'assistant' | 'tool';

  /** Message content */
  content: string;

  /** Tool calls made by assistant */
  toolCalls?: ToolCall[];

  /** Tool call ID for tool response */
  toolId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  /** Generated content */
  content?: string;

  /** Tool calls to execute */
  toolCalls?: ToolCall[];

  /** Token usage */
  usage?: TokenUsage;

  /** Is response complete */
  done: boolean;

  /** Thinking process (for displaying AI reasoning) */
  thinking?: ThinkingEvent;

  /** Response metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Thinking process event from AI provider
 */
export interface ThinkingEvent {
  /** Event type */
  type: 'tool_use' | 'thinking' | 'tool_result';

  /** Tool name (for tool_use events) */
  name?: string;

  /** Content (for thinking events) */
  content?: string;

  /** Input (for tool_use events) */
  input?: string;
}

export interface TokenUsage {
  /** Input tokens */
  promptTokens: number;

  /** Output tokens */
  completionTokens: number;

  /** Total tokens */
  totalTokens: number;
}

export interface ToolDefinition {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;

  /** Handler function (for local tools) */
  handler?: (input: unknown) => Promise<unknown>;
}

export interface ToolCall {
  /** Tool call ID */
  id: string;

  /** Tool name */
  name: string;

  /** Tool input arguments */
  arguments: Record<string, unknown>;
}

export interface ProviderStatus {
  /** Is provider available */
  available: boolean;

  /** Provider state */
  state: 'uninitialized' | 'ready' | 'busy' | 'error';

  /** Error message if in error state */
  error?: string;

  /** Current model */
  model?: string;

  /** Rate limit info */
  rateLimit?: RateLimitInfo;
}

export interface RateLimitInfo {
  /** Requests remaining */
  remaining: number;

  /** Reset timestamp */
  resetAt: Date;

  /** Request limit */
  limit: number;
}

export interface ProviderChatOptions {
  /** Stream response */
  stream?: boolean;

  /** Include usage info */
  includeUsage?: boolean;

  /** Custom headers */
  headers?: Record<string, string>;

  /** Timeout in milliseconds */
  timeout?: number;
}
