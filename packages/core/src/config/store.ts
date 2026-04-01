/**
 * Configuration Store - Manages configuration with schema validation
 * @module config
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import * as yaml from 'yaml';
import type { Logger } from '../utils/logger.js';

/**
 * Expand environment variables in a string
 * Supports ${VAR_NAME} syntax
 */
function expandEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || `\${${varName}}`;
    });
  }
  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = expandEnvVars(val);
    }
    return result;
  }
  return value;
}

export interface ConfigOptions {
  /** Config file path */
  path?: string;

  /** Default configuration values */
  defaults?: Record<string, unknown>;

  /** Auto-save on change */
  autoSave?: boolean;

  /** Environment variable prefix */
  envPrefix?: string;
}

export type ConfigValue = string | number | boolean | null | undefined | ConfigObject | ConfigArray;
export interface ConfigObject {
  [key: string]: ConfigValue;
}
export type ConfigArray = ConfigValue[];

export class ConfigStore {
  private _data: ConfigObject = Object.create(null);
  private _watchers: Set<(key: string, value: ConfigValue) => void> = new Set();

  /** Supported file extensions */
  private readonly FILE_EXTENSIONS = {
    JSON: 'json',
    YAML: 'yaml',
    YML: 'yml'
  } as const;

  /** Error message templates */
  private readonly ERRORS = {
    NO_PATH: 'No config file path specified',
    UNSUPPORTED_TYPE: (ext: string) => `Unsupported config file type: ${ext}`
  } as const;

  constructor(
    private readonly options: ConfigOptions = {},
    private readonly logger?: Logger
  ) {
    if (options.defaults) {
      this._data = { ...options.defaults } as ConfigObject;
    }
  }

  /**
   * Load configuration from file
   */
  async load(filePath?: string): Promise<void> {
    const path = filePath ?? this.options.path;

    if (!path) {
      throw new Error(this.ERRORS.NO_PATH);
    }

    const resolvedPath = resolve(path);

    if (!existsSync(resolvedPath)) {
      this.logger?.warn('Config file not found, using defaults', {
        path: resolvedPath,
        hasDefaults: !!this.options.defaults
      });
      this._data = (this.options.defaults ? { ...this.options.defaults } : {}) as ConfigObject;
      return;
    }

    const content = await readFile(resolvedPath, 'utf-8');
    const data = this.parseContent(content, resolvedPath);

    // Expand environment variables
    const expandedData = expandEnvVars(data) as ConfigObject;

    this._data = this.mergeDefaults(expandedData);
    this.logger?.info('Config loaded successfully', {
      path: resolvedPath,
      keysCount: Object.keys(this._data).length
    });
  }

  /**
   * Save configuration to file
   */
  async save(filePath?: string): Promise<void> {
    const path = filePath ?? this.options.path;

    if (!path) {
      throw new Error(this.ERRORS.NO_PATH);
    }

    const resolvedPath = resolve(path);
    const content = this.stringifyContent(this._data, resolvedPath);

    // Ensure directory exists
    const fs = await import('node:fs/promises');
    await fs.mkdir(dirname(resolvedPath), { recursive: true });

    await writeFile(resolvedPath, content, 'utf-8');
    this.logger?.info('Config saved successfully', {
      path: resolvedPath,
      size: content.length
    });
  }

  /**
   * Get configuration value by key (supports dot notation)
   */
  get<T = ConfigValue>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let value: unknown = this._data;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as ConfigObject)[k];
      } else {
        return defaultValue as T;
      }
    }

    return value as T;
  }

  /**
   * Set configuration value by key (supports dot notation)
   */
  set(key: string, value: ConfigValue): void {
    const keys = key.split('.');
    let current: ConfigObject = this._data;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object' || current[k] === null) {
        current[k] = {};
      }
      current = current[k] as ConfigObject;
    }

    const lastKey = keys[keys.length - 1];
    current[lastKey] = value;

    this.logger?.debug('Config value set', {
      key,
      valueType: typeof value
    });

    // Notify watchers
    for (const watcher of this._watchers) {
      watcher(key, value);
    }

    // Auto-save if enabled
    if (this.options.autoSave) {
      this.save().catch(err => {
        this.logger?.error('Failed to auto-save config', {
          error: err instanceof Error ? err.message : String(err)
        });
      });
    }
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const keys = key.split('.');
    let value: unknown = this._data;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as ConfigObject)[k];
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * Delete configuration value
   */
  delete(key: string): void {
    const keys = key.split('.');
    let current: ConfigObject = this._data;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object' || current[k] === null) {
        return;
      }
      current = current[k] as ConfigObject;
    }

    const lastKey = keys[keys.length - 1];
    delete current[lastKey];
  }

  /**
   * Get all configuration
   */
  all(): ConfigObject {
    return { ...this._data };
  }

  /**
   * Watch configuration changes
   */
  watch(callback: (key: string, value: ConfigValue) => void): () => void {
    this._watchers.add(callback);

    return () => {
      this._watchers.delete(callback);
    };
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this._data = (this.options.defaults ? { ...this.options.defaults } : {}) as ConfigObject;
  }

  /**
   * Merge configuration with another object
   */
  merge(data: ConfigObject): void {
    this._data = this.deepMerge(this._data, data);
  }

  /**
   * Parse configuration file content based on extension
   */
  private parseContent(content: string, path: string): Record<string, unknown> {
    const ext = path.split('.').pop()?.toLowerCase();

    switch (ext) {
      case this.FILE_EXTENSIONS.JSON:
        return JSON.parse(content);
      case this.FILE_EXTENSIONS.YAML:
      case this.FILE_EXTENSIONS.YML:
        return this.parseYAML(content);
      default:
        this.logger?.error('Unsupported config file type', { ext, path });
        throw new Error(this.ERRORS.UNSUPPORTED_TYPE(ext || 'unknown'));
    }
  }

  /**
   * Stringify configuration for file based on extension
   */
  private stringifyContent(data: Record<string, unknown>, path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();

    switch (ext) {
      case this.FILE_EXTENSIONS.JSON:
        return JSON.stringify(data, null, 2);
      case this.FILE_EXTENSIONS.YAML:
      case this.FILE_EXTENSIONS.YML:
        return this.stringifyYAML(data);
      default:
        this.logger?.warn('Unknown file extension, defaulting to JSON', { ext });
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Parse YAML content
   */
  private parseYAML(content: string): Record<string, unknown> {
    return yaml.parse(content) as Record<string, unknown>;
  }

  /**
   * Stringify to YAML
   */
  private stringifyYAML(data: Record<string, unknown>, _indent = 0): string {
    return yaml.stringify(data);
  }

  /**
   * Merge defaults with config data
   */
  private mergeDefaults(data: ConfigObject): ConfigObject {
    const defaults = this.options.defaults ? { ...this.options.defaults } : {};
    return this.deepMerge(defaults, data);
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): ConfigObject {
    const result: Record<string, unknown> = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.deepMerge(
          (result[key] as Record<string, unknown>) || {},
          value as Record<string, unknown>
        );
      } else {
        result[key] = value as ConfigValue;
      }
    }

    return result as ConfigObject;
  }
}
