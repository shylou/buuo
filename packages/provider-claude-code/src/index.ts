/**
 * Claude Code Provider Plugin
 *
 * Local Claude Code CLI integration using --resume mode for efficient context management.
 * Also supports Agent SDK for real-time bidirectional conversation.
 */

import type { ProviderPlugin, ProviderPluginConfig } from '@buuo/core/plugins';
import { ClaudeCodeProvider } from './cli-provider.js';
import { AgentSDKProvider } from './sdk-provider.js';

export class ClaudeCodeProviderPlugin implements ProviderPlugin {
  readonly id = 'claude-code-provider' as const;
  readonly name = 'Claude Code Provider';
  readonly version = '1.1.0';
  readonly description = 'Local Claude Code CLI and Agent SDK integration provider';
  readonly type = 'provider' as const;

  async initialize(): Promise<void> {
    // Initialization logic if needed
  }

  async start(): Promise<void> {
    // Plugin-level startup logic if needed
  }

  async stop(): Promise<void> {
    // Plugin-level shutdown logic if needed
  }

  createProvider(config: import('@buuo/core/plugins').ProviderPluginConfig): import('@buuo/core/providers').AIProvider {
    const id = (config as any).id || 'claude-code';
    const providerType = (config as any).providerType || 'cli';

    if (providerType === 'agent-sdk') {
      return new AgentSDKProvider(id);
    }

    return new ClaudeCodeProvider(id);
  }
}

// Re-export providers and types
export { ClaudeCodeProvider };
export { AgentSDKProvider };
export type { ClaudeCodeConfig } from './cli-provider.js';
export type { AgentSDKConfig } from './sdk-provider.js';
