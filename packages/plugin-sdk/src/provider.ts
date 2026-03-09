/**
 * Provider Plugin SDK - Utilities for creating provider plugins
 */

import type {
  AIProvider,
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  TokenUsage
} from '@buuo/core/providers';
import { BaseProvider } from '@buuo/core/providers';
import type { ProviderPlugin, PluginContext } from '@buuo/core/plugins';

export interface ProviderPluginOptions {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  createProvider: (config: ProviderConfig) => AIProvider;
}

export function createProviderPlugin(options: ProviderPluginOptions): ProviderPlugin {
  let context: PluginContext | null = null;

  return {
    id: options.id,
    name: options.name,
    version: options.version,
    description: options.description,
    type: 'provider',
    author: options.author,

    async initialize(ctx: PluginContext): Promise<void> {
      context = ctx;
      ctx.logger.info(`Provider plugin "${options.id}" initialized`);
    },

    async start(): Promise<void> {
      context?.logger.info(`Provider plugin "${options.id}" started`);
    },

    async stop(): Promise<void> {
      context?.logger.info(`Provider plugin "${options.id}" stopped`);
    },

    createProvider(config: ProviderConfig): AIProvider {
      return options.createProvider(config);
    }
  };
}

export abstract class SimpleProvider extends BaseProvider {
  protected _defaultModel: string;

  constructor(
    id: string,
    name: string,
    defaultModel: string = 'default'
  ) {
    super(id, name);
    this._defaultModel = defaultModel;
  }

  protected async doInitialize(): Promise<void> {
    const config = this._config;
    if (config?.model) {
      this._defaultModel = config.model;
    }
  }

  /**
   * Simple chat wrapper for providers that don't support streaming
   */
  protected async *doChatStreamFromChat(request: ChatRequest): AsyncIterable<ChatResponse> {
    const response = await this.doChat(request);
    yield response;
  }

  /**
   * Calculate token usage
   */
  protected calculateUsage(input: string, output: string): TokenUsage {
    const promptTokens = this.estimateTokens(input);
    const completionTokens = this.estimateTokens(output);
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }

  /**
   * Estimate tokens (rough estimate: ~4 chars per token)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
