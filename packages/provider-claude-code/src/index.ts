/**
 * Claude Code Provider Plugin
 *
 * Local Claude Code CLI integration using --resume mode for efficient context management.
 */

import type { ProviderPlugin, ProviderPluginConfig } from '@buuo/core/plugins';
import { ClaudeCodeProvider } from './claude-code.js';

export class ClaudeCodeProviderPlugin implements ProviderPlugin {
  readonly id = 'claude-code-provider' as const;
  readonly name = 'Claude Code Provider';
  readonly version = '1.0.0';
  readonly description = 'Local Claude Code CLI integration provider';
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
    return new ClaudeCodeProvider(id);
  }
}

// Re-export provider and types
export { ClaudeCodeProvider };
export type { ClaudeCodeConfig } from './claude-code.js';
