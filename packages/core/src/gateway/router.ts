/**
 * Message Router - Routes messages between channels and AI providers
 * @module gateway
 */

import type { Channel } from '../channels/index.js';
import type { AIProvider, ChatRequest, ChatResponse } from '../providers/index.js';
import type { Session } from './session.js';
import type { IncomingMessage } from '../channels/index.js';
import type { Logger } from '../utils/logger.js';
import { getModelForProvider } from '../providers/model-config.js';

/** LRU Cache for conversation to channel mappings */
class LRUCache<K, V> {
  private readonly cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove existing key if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Add to end
    this.cache.set(key, value);
    // Evict oldest if at capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

export interface RouterOptions {
  /** Default provider ID */
  defaultProvider?: string;

  /** System prompt */
  systemPrompt?: string;

  /** Default temperature */
  temperature?: number;

  /** Default max tokens */
  maxTokens?: number;

  /** Stream responses */
  stream?: boolean;
}

export class MessageRouter {
  private readonly channelMap = new Map<string, Channel>();
  private readonly providerMap = new Map<string, AIProvider>();
  private readonly conversationChannel = new LRUCache<string, string>(1000); // LRU cache with max 1000 entries

  /** Default configuration constants */
  private readonly DEFAULTS = {
    PROVIDER_ID: 'default',
    TEMPERATURE: 0.7,
    MAX_TOKENS: 4096,
    STREAM: true
  } as const;

  constructor(
    private readonly options: RouterOptions = {},
    private readonly logger?: Logger
  ) {}

  /**
   * Register a channel
   */
  registerChannel(channel: Channel): void {
    this.channelMap.set(channel.id, channel);
    this.logger?.debug('Channel registered', {
      channelId: channel.id,
      totalChannels: this.channelMap.size
    });
  }

  /**
   * Unregister a channel
   */
  unregisterChannel(channelId: string): void {
    this.channelMap.delete(channelId);
    this.logger?.debug('Channel unregistered', {
      channelId,
      remainingChannels: this.channelMap.size
    });
  }

  /**
   * Register a provider
   */
  registerProvider(provider: AIProvider): void {
    this.providerMap.set(provider.id, provider);
    this.logger?.debug('Provider registered', {
      providerId: provider.id,
      totalProviders: this.providerMap.size
    });
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    this.providerMap.delete(providerId);
    this.logger?.debug('Provider unregistered', {
      providerId,
      remainingProviders: this.providerMap.size
    });
  }

  /**
   * Get channel for conversation
   */
  getChannelForConversation(conversationId: string): Channel | undefined {
    const channelId = this.conversationChannel.get(conversationId);
    return channelId ? this.channelMap.get(channelId) : undefined;
  }

  /**
   * Route message to provider and get response
   */
  async route(session: Session, message: IncomingMessage): Promise<AsyncIterable<ChatResponse>> {
    // Track conversation -> channel mapping
    this.conversationChannel.set(message.conversationId, message.metadata?.channelId as string);

    // Get provider with fallback logic
    const requestedProviderId = session.data.providerId as string | undefined;
    let providerId = requestedProviderId ?? this.options.defaultProvider ?? this.DEFAULTS.PROVIDER_ID;
    let provider = this.providerMap.get(providerId);

    // If provider not found, try default provider
    if (!provider && providerId !== this.DEFAULTS.PROVIDER_ID) {
      this.logger?.warn('Requested provider unavailable, falling back to default provider', {
        sessionId: session.id,
        conversationId: message.conversationId,
        requestedProviderId: providerId,
        fallbackProviderId: this.options.defaultProvider ?? this.DEFAULTS.PROVIDER_ID,
      });
      providerId = this.options.defaultProvider ?? this.DEFAULTS.PROVIDER_ID;
      provider = this.providerMap.get(providerId);
    }

    // Validate provider exists
    if (!provider) {
      this.logger?.error('Provider not found', {
        requestedProviderId: providerId,
        availableProviders: Array.from(this.providerMap.keys())
      });
      throw new Error(`Provider not found: ${providerId}`);
    }

    // Store providerId in session for /cancel command
    session.data.providerId = providerId;

    this.logger?.debug('Routing to provider', {
      sessionId: session.id,
      providerId,
      model: session.data.model
    });

    // Build message with only current content (resume mode - Claude Code manages history)
    const messages = [{
      role: 'user' as const,
      content: message.content,
      metadata: {
        attachments: message.attachments
      }
    }];

    // Build chat request with session and defaults
    const model = session.data.model as string | undefined;
    const request: ChatRequest = {
      sessionId: session.id,
      messages: messages,
      systemPrompt: session.data.systemPrompt as string ?? this.options.systemPrompt,
      temperature: session.data.temperature as number ?? this.options.temperature ?? this.DEFAULTS.TEMPERATURE,
      maxTokens: session.data.maxTokens as number ?? this.options.maxTokens ?? this.DEFAULTS.MAX_TOKENS,
      model: model ? getModelForProvider(model, provider) : undefined
    };

    const effectiveModel = request.model ?? provider.getStatus().model ?? 'provider-default';

    this.logger?.info('Message routed', {
      messageId: message.id,
      conversationId: message.conversationId,
      sessionId: session.id,
      providerId,
      requestedProviderId: providerId,
      requestedModel: effectiveModel,
      effectiveModel,
      stream: this.options.stream ?? this.DEFAULTS.STREAM,
    });

    this.logger?.debug('Chat request prepared', {
      sessionId: session.id,
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stream: this.options.stream ?? this.DEFAULTS.STREAM
    });

    // Route to provider
    if (this.options.stream ?? this.DEFAULTS.STREAM) {
      return provider.chatStream(request);
    } else {
      const response = await provider.chat(request);
      return (async function* () {
        yield response;
      })();
    }
  }

  /**
   * Send response through channel
   */
  async sendResponse(
    conversationId: string,
    responses: AsyncIterable<ChatResponse>
  ): Promise<void> {
    const channel = this.getChannelForConversation(conversationId);
    if (!channel) {
      this.logger?.error('No channel found for conversation', {
        conversationId,
        cachedConversations: this.conversationChannel.size
      });
      throw new Error(`No channel found for conversation: ${conversationId}`);
    }

    let fullContent = '';
    let chunkCount = 0;

    for await (const response of responses) {
      if (response.content) {
        fullContent += response.content;
        chunkCount++;
      }

      // Note: toolCalls in responses are available but not currently handled

      if (response.done) {
        this.logger?.debug('Sending response to channel', {
          conversationId,
          contentLength: fullContent.length,
          chunkCount
        });

        await channel.sendMessage({
          conversationId,
          content: fullContent
        });
      }
    }
  }

  /**
   * Get all registered channels
   */
  getChannels(): Channel[] {
    return Array.from(this.channelMap.values());
  }

  /**
   * Get all registered providers
   */
  getProviders(): AIProvider[] {
    return Array.from(this.providerMap.values());
  }

  /**
   * Get channel by ID
   */
  getChannel(channelId: string): Channel | undefined {
    return this.channelMap.get(channelId);
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): AIProvider | undefined {
    return this.providerMap.get(providerId);
  }
}
