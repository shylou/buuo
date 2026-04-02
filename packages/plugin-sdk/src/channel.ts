/**
 * Channel Plugin SDK - Utilities for creating channel plugins
 */

import type {
  Channel,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
} from '@buuo/core/channels';
import { BaseChannel } from '@buuo/core/channels';
import type { ChannelPlugin, PluginContext } from '@buuo/core/plugins';

export interface ChannelPluginFactory {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  createChannel(config: ChannelConfig): Channel;
}

export interface ChannelPluginOptions {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  createChannel: (config: ChannelConfig) => Channel;
}

export function createChannelPlugin(options: ChannelPluginOptions): ChannelPlugin {
  let context: PluginContext | null = null;

  return {
    id: options.id,
    name: options.name,
    version: options.version,
    description: options.description,
    type: 'channel',
    author: options.author,

    async initialize(ctx: PluginContext): Promise<void> {
      context = ctx;
      ctx.logger.info(`Channel plugin "${options.id}" initialized`);
    },

    async start(): Promise<void> {
      context?.logger.info(`Channel plugin "${options.id}" started`);
    },

    async stop(): Promise<void> {
      context?.logger.info(`Channel plugin "${options.id}" stopped`);
    },

    createChannel(config: ChannelConfig): Channel {
      return options.createChannel(config);
    }
  };
}

export abstract class SimpleChannel extends BaseChannel {
  constructor(
    id: string,
    name: string,
    type: string
  ) {
    super(id, name, type);
  }

  /**
   * Simple message handler that can be overridden
   */
  protected emitMessage(message: IncomingMessage): void {
    this.handleMessage(message);
  }

  /**
   * Simple status reporter
   */
  protected setStatus(status: Partial<ChannelStatus>): void {
    this._status = { ...this._status, ...status };
    this.emit('status:change', this.status);
  }
}
