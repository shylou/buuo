/**
 * Lark/Feishu Channel Plugin
 */

export { LarkChannel } from './lark.js';
export type {
  LarkConfig,
  LarkEvent,
  LarkEventData,
  LarkMessageContent,
  LarkSendMessageOptions,
  LarkUser,
  LarkResponse,
  LarkUserInfoResponse,
  LarkSendMessageResponse,
} from './types.js';

import type { ChannelPlugin, PluginContext, ChannelPluginConfig, JSONSchema, ValidationResult } from '@buuo/core';
import { LarkChannel } from './lark.js';

/**
 * Lark/Feishu Channel Plugin
 */
export class LarkChannelPlugin implements ChannelPlugin {
  id = 'lark-channel';
  name = 'Lark/Feishu Channel Plugin';
  version = '0.1.0';
  description = 'Lark/Feishu channel for Buuo AI Assistant';
  type = 'channel' as const;

  private context?: PluginContext;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    context.gateway.on('lark:initialized', () => {
      context.logger?.info('Lark channel initialized');
    });
  }

  async start(): Promise<void> {
    this.context?.logger?.info('Lark channel plugin started');
  }

  async stop(): Promise<void> {
    this.context?.logger?.info('Lark channel plugin stopped');
  }

  createChannel(config: ChannelPluginConfig): import('@buuo/core').Channel {
    return new LarkChannel({ id: config.token });
  }

  getConfigSchema?(): JSONSchema {
    return {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          title: 'App ID',
          description: 'Lark/Feishu App ID from Open Platform',
        },
        options: {
          type: 'object',
          properties: {
            appSecret: {
              type: 'string',
              title: 'App Secret',
              description: 'Lark/Feishu App Secret from Open Platform',
            },
            encryptKey: {
              type: 'string',
              title: 'Encrypt Key',
              description: 'Encrypt key for event verification (optional)',
            },
            verificationToken: {
              type: 'string',
              title: 'Verification Token',
              description: 'Verification token for webhook (optional)',
            },
            port: {
              type: 'number',
              title: 'Webhook Port',
              description: 'Port for webhook server',
              default: 3000,
            },
            webhookPath: {
              type: 'string',
              title: 'Webhook Path',
              description: 'Path for webhook endpoint',
              default: '/lark/webhook',
            },
          },
          required: ['appSecret'],
        },
      },
      required: ['token', 'options'],
    };
  }

  validateConfig?(config: unknown): ValidationResult {
    const errors: Array<{ path: string; message: string; value: unknown }> = [];

    if (typeof config !== 'object' || config === null) {
      errors.push({ path: '', message: 'Config must be an object', value: config });
      return { valid: false, errors };
    }

    const cfg = config as Record<string, unknown>;

    if (!cfg.token || typeof cfg.token !== 'string') {
      errors.push({ path: 'token', message: 'App ID (token) is required', value: cfg.token });
    }

    if (!cfg.options || typeof cfg.options !== 'object') {
      errors.push({ path: 'options', message: 'Options object with appSecret is required', value: cfg.options });
    } else {
      const options = cfg.options as Record<string, unknown>;
      if (!options.appSecret || typeof options.appSecret !== 'string') {
        errors.push({ path: 'options.appSecret', message: 'appSecret in options is required', value: options.appSecret });
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

// Export plugin instance for dynamic loading
export const plugin = new LarkChannelPlugin();

// Default export
export default plugin;
