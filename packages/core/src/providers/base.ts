/**
 * Base Provider - Abstract base class for AI provider implementations
 * @module providers
 */

import type {
  AIProvider,
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  ProviderStatus
} from './interface.js';
import { EventEmitter } from 'eventemitter3';

export abstract class BaseProvider extends EventEmitter implements AIProvider {
  protected _config: ProviderConfig | null = null;
  protected _initialized = false;
  protected _status: ProviderStatus = {
    available: false,
    state: 'uninitialized'
  };

  constructor(
    public id: string,
    public name: string
  ) {
    super();
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get status(): ProviderStatus {
    return { ...this._status };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    if (this._initialized) {
      throw new Error(`Provider ${this.id} is already initialized`);
    }

    this._config = config;
    await this.doInitialize();
    this._initialized = true;
    this._status = {
      available: true,
      state: 'ready',
      model: config.model ?? this._status.model
    };
    this.emit('initialized');
    this.emit('status:change', this.status);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this._initialized) {
      throw new Error(`Provider ${this.id} is not initialized`);
    }

    this._status.state = 'busy';
    this.emit('status:change', this.status);

    try {
      const response = await this.doChat(request);
      return response;
    } finally {
      this._status.state = 'ready';
      this.emit('status:change', this.status);
    }
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    if (!this._initialized) {
      throw new Error(`Provider ${this.id} is not initialized`);
    }

    this._status.state = 'busy';
    this.emit('status:change', this.status);

    try {
      yield* this.doChatStream(request);
    } finally {
      this._status.state = 'ready';
      this.emit('status:change', this.status);
    }
  }

  getStatus(): ProviderStatus {
    return { ...this._status };
  }

  async cleanup(): Promise<void> {
    // Default no-op. Providers can override when they manage timers or subprocesses.
  }

  /**
   * Abstract methods to be implemented by concrete providers
   */
  protected abstract doInitialize(): Promise<void>;
  protected abstract doChat(request: ChatRequest): Promise<ChatResponse>;
  protected abstract doChatStream(request: ChatRequest): AsyncIterable<ChatResponse>;
  public abstract estimateTokens(text: string): number;
}
