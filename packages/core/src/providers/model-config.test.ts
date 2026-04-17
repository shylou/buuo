/**
 * Model Configuration tests
 */

import { describe, it, expect } from 'vitest';
import {
  CLAUDE_MODELS,
  MODEL_ALIASES,
  MODEL_DISPLAY_NAMES,
  isValidModelAlias,
  getModelId,
  getModelAlias,
  getModelForProvider,
  isCodexProvider,
  isAgentSdkProvider,
  getDisplayModelName,
} from './model-config.js';

describe('Model Configuration', () => {
  describe('Constants', () => {
    it('should define all Claude models', () => {
      expect(CLAUDE_MODELS.DEFAULT).toBe('claude-sonnet-4-6');
      expect(CLAUDE_MODELS.HAIKU).toBe('claude-haiku-4-20250114');
      expect(CLAUDE_MODELS.SONNET).toBe('claude-sonnet-4-6');
      expect(CLAUDE_MODELS.OPUS).toBe('claude-opus-4-6');
    });

    it('should define model aliases', () => {
      expect(MODEL_ALIASES['default']).toBe(CLAUDE_MODELS.DEFAULT);
      expect(MODEL_ALIASES['haiku']).toBe(CLAUDE_MODELS.HAIKU);
      expect(MODEL_ALIASES['sonnet']).toBe(CLAUDE_MODELS.SONNET);
      expect(MODEL_ALIASES['opus']).toBe(CLAUDE_MODELS.OPUS);
    });

    it('should define display names', () => {
      expect(MODEL_DISPLAY_NAMES['default']).toBe('Default (Sonnet 4.6)');
      expect(MODEL_DISPLAY_NAMES['haiku']).toBe('Haiku 4');
      expect(MODEL_DISPLAY_NAMES['sonnet']).toBe('Sonnet 4.6');
      expect(MODEL_DISPLAY_NAMES['opus']).toBe('Opus 4.6');
    });
  });

  describe('isValidModelAlias', () => {
    it('should return true for valid aliases', () => {
      expect(isValidModelAlias('default')).toBe(true);
      expect(isValidModelAlias('haiku')).toBe(true);
      expect(isValidModelAlias('sonnet')).toBe(true);
      expect(isValidModelAlias('opus')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isValidModelAlias('DEFAULT')).toBe(true);
      expect(isValidModelAlias('HAiku')).toBe(true);
      expect(isValidModelAlias('SoNnEt')).toBe(true);
    });

    it('should return false for invalid aliases', () => {
      expect(isValidModelAlias('invalid')).toBe(false);
      expect(isValidModelAlias('gpt-4')).toBe(false);
      expect(isValidModelAlias('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidModelAlias(undefined as any)).toBe(false);
      expect(isValidModelAlias(null as any)).toBe(false);
      expect(isValidModelAlias(123 as any)).toBe(false);
    });
  });

  describe('getModelId', () => {
    it('should return model ID for valid alias', () => {
      expect(getModelId('default')).toBe('claude-sonnet-4-6');
      expect(getModelId('haiku')).toBe('claude-haiku-4-20250114');
      expect(getModelId('sonnet')).toBe('claude-sonnet-4-6');
      expect(getModelId('opus')).toBe('claude-opus-4-6');
    });

    it('should be case-insensitive', () => {
      expect(getModelId('DEFAULT')).toBe('claude-sonnet-4-6');
      expect(getModelId('HAIKU')).toBe('claude-haiku-4-20250114');
    });

    it('should return undefined for invalid alias', () => {
      expect(getModelId('invalid')).toBeUndefined();
      expect(getModelId('')).toBeUndefined();
    });

    it('should handle edge cases', () => {
      expect(getModelId(undefined as any)).toBeUndefined();
      expect(getModelId(null as any)).toBeUndefined();
      expect(getModelId(123 as any)).toBeUndefined();
    });
  });

  describe('getModelAlias', () => {
    it('should return alias as-is if already an alias', () => {
      expect(getModelAlias('default')).toBe('default');
      expect(getModelAlias('haiku')).toBe('haiku');
      expect(getModelAlias('sonnet')).toBe('sonnet');
      expect(getModelAlias('opus')).toBe('opus');
    });

    it('should map full model ID to alias', () => {
      expect(getModelAlias('claude-sonnet-4-6')).toBe('sonnet');
      expect(getModelAlias('claude-haiku-4-20250114')).toBe('haiku');
      expect(getModelAlias('claude-opus-4-6')).toBe('opus');
    });

    it('should be case-insensitive for aliases', () => {
      expect(getModelAlias('DEFAULT')).toBe('default');
      expect(getModelAlias('SONNET')).toBe('sonnet');
    });

    it('should return original input if not found', () => {
      expect(getModelAlias('gpt-4')).toBe('gpt-4');
      expect(getModelAlias('unknown-model')).toBe('unknown-model');
    });

    it('should handle edge cases', () => {
      expect(getModelAlias('')).toBe('');
      expect(getModelAlias(undefined as any)).toBeUndefined();
      expect(getModelAlias(null as any)).toBeNull();
    });
  });

  describe('getModelForProvider', () => {
    it('should return alias for agent-sdk provider', () => {
      expect(getModelForProvider('sonnet', 'agent-sdk')).toBe('sonnet');
      expect(getModelForProvider('claude-sonnet-4-6', 'agent-sdk')).toBe('sonnet');
    });

    it('should return full ID for CLI provider', () => {
      expect(getModelForProvider('sonnet')).toBe('claude-sonnet-4-6');
      expect(getModelForProvider('sonnet', 'cli')).toBe('claude-sonnet-4-6');
    });

    it('should return original model if not found', () => {
      expect(getModelForProvider('gpt-4')).toBe('gpt-4');
      expect(getModelForProvider('gpt-4', 'agent-sdk')).toBe('gpt-4');
    });

    it('should handle undefined provider type', () => {
      expect(getModelForProvider('sonnet', undefined)).toBe('claude-sonnet-4-6');
    });

    it('should use provider names when ids are customized', () => {
      expect(getModelForProvider('claude-sonnet-4-6', { id: 'claude-primary', name: 'Agent SDK' })).toBe('sonnet');
      expect(getModelForProvider('sonnet', { id: 'codex-primary', name: 'Codex CLI' })).toBe('sonnet');
    });
  });

  describe('provider detection', () => {
    it('should detect providers by canonical names', () => {
      expect(isAgentSdkProvider({ id: 'claude-primary', name: 'Agent SDK' })).toBe(true);
      expect(isCodexProvider({ id: 'codex-primary', name: 'Codex CLI' })).toBe(true);
    });

    it('should preserve codex display naming with renamed providers', () => {
      expect(getDisplayModelName('', { id: 'codex-primary', name: 'Codex CLI' })).toBe('provider default');
      expect(getDisplayModelName('gpt-5.4-mini', { id: 'codex-primary', name: 'Codex CLI' })).toBe('gpt-5.4-mini');
    });
  });
});
