/**
 * Model Configuration - Supported Claude models and aliases
 * @module providers
 */

/** Supported Claude model IDs */
export const CLAUDE_MODELS = {
  /** Default model (Sonnet 4.6) */
  DEFAULT: 'claude-sonnet-4-6',
  /** Haiku 4 model (fast, cost-effective) */
  HAIKU: 'claude-haiku-4-20250114',
  /** Sonnet 4.6 model (balanced performance) */
  SONNET: 'claude-sonnet-4-6',
  /** Opus 4.6 model (highest capability) */
  OPUS: 'claude-opus-4-6',
} as const;

/** User-friendly model aliases */
export const MODEL_ALIASES: Record<string, string> = {
  'default': CLAUDE_MODELS.DEFAULT,
  'haiku': CLAUDE_MODELS.HAIKU,
  'sonnet': CLAUDE_MODELS.SONNET,
  'opus': CLAUDE_MODELS.OPUS,
};

/** Display names for models */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'default': 'Default (Sonnet 4.6)',
  'haiku': 'Haiku 4',
  'sonnet': 'Sonnet 4.6',
  'opus': 'Opus 4.6',
};

export interface ProviderModelTarget {
  id?: string;
  name?: string;
}

type ProviderHint = string | ProviderModelTarget | undefined;

function getProviderHint(provider: ProviderHint): { id?: string; name?: string } {
  if (!provider) {
    return {};
  }

  if (typeof provider === 'string') {
    return { id: provider, name: provider };
  }

  return provider;
}

export function isAgentSdkProvider(provider?: ProviderHint): boolean {
  const hint = getProviderHint(provider);
  return hint.id === 'agent-sdk' || hint.name === 'Agent SDK';
}

export function isCodexProvider(provider?: ProviderHint): boolean {
  const hint = getProviderHint(provider);
  return hint.id === 'codex-cli' || hint.name === 'Codex CLI';
}

export function getAvailableModelsForProvider(provider?: ProviderHint): string[] {
  if (isCodexProvider(provider)) {
    return [];
  }

  return Object.keys(MODEL_ALIASES);
}

export function getDisplayModelName(model: string, provider?: ProviderHint): string {
  if (!model) {
    return isCodexProvider(provider) ? 'provider default' : MODEL_DISPLAY_NAMES.default;
  }

  if (isCodexProvider(provider)) {
    return model;
  }

  return MODEL_DISPLAY_NAMES[model] || model;
}

/** Check if a model alias is valid */
export function isValidModelAlias(alias: string): boolean {
  if (typeof alias !== 'string') return false;
  return MODEL_ALIASES.hasOwnProperty(alias.toLowerCase());
}

/** Get model ID from alias */
export function getModelId(alias: string): string | undefined {
  if (typeof alias !== 'string') return undefined;
  return MODEL_ALIASES[alias.toLowerCase()];
}

/**
 * Map model full ID back to alias
 * Used by providers that need aliases (e.g., Agent SDK) to read from settings.json
 */
export function getModelAlias(modelId: string): string {
  if (typeof modelId !== 'string') return modelId;
  // If already an alias, return as is
  const lowerModel = modelId.toLowerCase();
  if (['default', 'haiku', 'sonnet', 'opus'].includes(lowerModel)) {
    return lowerModel;
  }

  // Reverse mapping from full ID to alias
  const ID_TO_ALIAS: Record<string, string> = {
    'claude-sonnet-4-6': 'sonnet',
    'claude-haiku-4-20250114': 'haiku',
    'claude-opus-4-6': 'opus',
    'claude-sonnet-4-20250514': 'sonnet',
    'claude-opus-4-20250514': 'opus',
  };

  return ID_TO_ALIAS[modelId] || modelId;
}

/**
 * Get the appropriate model value for a specific provider type
 * - CLI provider: needs full model ID
 * - Agent SDK provider: needs alias to read from settings.json
 */
export function getModelForProvider(model: string, provider?: ProviderHint): string {
  // Agent SDK provider uses alias to read from settings.json
  if (isAgentSdkProvider(provider)) {
    return getModelAlias(model);
  }
  // Codex uses raw model strings as-is.
  if (isCodexProvider(provider)) {
    return model;
  }
  // CLI and other providers use full model ID
  return getModelId(model) || model;
}
