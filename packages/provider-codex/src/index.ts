import type { ProviderPlugin } from '@buuo/core/plugins';
import { CodexCliProvider } from './cli-provider.js';

export class CodexProviderPlugin implements ProviderPlugin {
  readonly id = 'codex-provider' as const;
  readonly name = 'Codex Provider';
  readonly version = '0.1.0';
  readonly description = 'Local Codex CLI integration provider';
  readonly type = 'provider' as const;

  async initialize(): Promise<void> {
    // No plugin-level initialization required.
  }

  async start(): Promise<void> {
    // No plugin-level startup required.
  }

  async stop(): Promise<void> {
    // No plugin-level shutdown required.
  }

  createProvider(config: import('@buuo/core/plugins').ProviderPluginConfig): import('@buuo/core/providers').AIProvider {
    const id = (config as { id?: string }).id || 'codex-cli';
    return new CodexCliProvider(id);
  }
}

export { CodexCliProvider };
export type { CodexCliConfig } from './cli-provider.js';
