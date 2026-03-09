/**
 * Base Channel - Abstract base class for channel implementations
 * @module channels
 */

import type {
  Channel,
  ChannelConfig,
  IncomingMessage,
  OutgoingMessage,
  MessageHandler,
  ChannelStatus
} from './interface.js';
import { EventEmitter } from 'eventemitter3';

export abstract class BaseChannel extends EventEmitter implements Channel {
  protected _config: ChannelConfig | null = null;
  protected _initialized = false;
  protected _started = false;
  protected _messageHandlers: MessageHandler[] = [];
  protected _status: ChannelStatus = {
    connected: false,
    state: 'disconnected'
  };

  constructor(
    public id: string,
    public name: string,
    public type: string
  ) {
    super();
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get started(): boolean {
    return this._started;
  }

  get status(): ChannelStatus {
    return { ...this._status };
  }

  async initialize(config: ChannelConfig): Promise<void> {
    if (this._initialized) {
      throw new Error(`Channel ${this.id} is already initialized`);
    }

    this._config = config;
    await this.doInitialize();
    this._initialized = true;
    this.emit('initialized');
  }

  async start(): Promise<void> {
    if (!this._initialized) {
      throw new Error(`Channel ${this.id} is not initialized`);
    }

    if (this._started) {
      throw new Error(`Channel ${this.id} is already started`);
    }

    this._status.state = 'connecting';
    this.emit('status:change', this.status);

    await this.doStart();

    this._started = true;
    this._status.state = 'connected';
    this._status.connected = true;
    this._status.connectedAt = new Date();
    this.emit('status:change', this.status);
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    await this.doStop();

    this._started = false;
    this._status.state = 'disconnected';
    this._status.connected = false;
    this.emit('status:change', this.status);
    this.emit('stopped');
  }

  onMessage(handler: MessageHandler): void {
    this._messageHandlers.push(handler);
  }

  getStatus(): ChannelStatus {
    return { ...this._status };
  }

  async dispose(): Promise<void> {
    await this.stop();
    this._messageHandlers = [];
    this._config = null;
    this._initialized = false;
    this.emit('disposed');
  }

  /**
   * Handle incoming message - called by implementations
   */
  protected handleMessage(message: IncomingMessage): void {
    for (const handler of this._messageHandlers) {
      const result = handler(message);
      if (result && typeof result.catch === 'function') {
        result.catch((error: Error) => {
          this.emit('error', new Error(`Message handler error: ${error.message}`));
        });
      }
    }
  }

  /**
   * Abstract methods to be implemented by concrete channels
   */
  protected abstract doInitialize(): Promise<void>;
  protected abstract doStart(): Promise<void>;
  protected abstract doStop(): Promise<void>;
  public abstract sendMessage(message: OutgoingMessage): Promise<void>;
}
