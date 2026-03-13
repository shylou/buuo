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

/** Check if a model alias is valid */
export function isValidModelAlias(alias: string): boolean {
  return MODEL_ALIASES.hasOwnProperty(alias.toLowerCase());
}

/** Get model ID from alias */
export function getModelId(alias: string): string | undefined {
  return MODEL_ALIASES[alias.toLowerCase()];
}
