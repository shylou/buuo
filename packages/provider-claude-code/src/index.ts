/**
 * Claude Code provider plugin
 */

import type { ProviderPlugin, PluginContext } from '@buuo/core/plugins';
import { ClaudeCodeProvider } from './claude-code.js';

export class ClaudeCodeProviderPlugin implements ProviderPlugin {
  id = 'claude-code-provider' as const;
  name = 'Claude Code Provider';
  version = '0.1.0';
  description = 'Local Claude Code CLI integration provider';
  type = 'provider' as const;

  async initialize(context: PluginContext): Promise<void> {
    context.logger.info('Claude Code provider plugin initialized');
  }

  async start(): Promise<void> {
    // Plugin-level startup if needed
  }

  async stop(): Promise<void> {
    // Plugin-level shutdown if needed
  }

  createProvider(config: any): import('@buuo/core/providers').AIProvider {
    return new ClaudeCodeProvider(config.id || 'claude-code');
  }
}

export { ClaudeCodeProvider };
export type { ClaudeCodeConfig } from './claude-code.js';
