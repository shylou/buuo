/**
 * Plugin Manager - Manages plugin lifecycle and registration
 * @module plugins
 */

import { EventEmitter } from 'eventemitter3';
import type { Plugin, PluginContext, PluginType, ValidationResult } from './interface.js';
import type { Logger } from '../utils/logger.js';

export interface PluginLoadResult {
  /** Plugin ID */
  id: string;

  /** Load success */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

export interface PluginInfo {
  /** Plugin ID */
  id: string;

  /** Plugin name */
  name: string;

  /** Plugin version */
  version: string;

  /** Plugin type */
  type: PluginType;

  /** Is loaded */
  loaded: boolean;

  /** Is started */
  started: boolean;

  /** Plugin description */
  description: string;

  /** Load time */
  loadedAt?: Date;

  /** Start time */
  startedAt?: Date;
}

export class PluginManager extends EventEmitter {
  private readonly plugins = new Map<string, Plugin>();
  private readonly pluginStatus = new Map<string, { loaded: boolean; started: boolean }>();

  /** Error message templates */
  private readonly ERRORS = {
    ALREADY_REGISTERED: (id: string) => `Plugin ${id} is already registered`,
    NOT_FOUND: (id: string) => `Plugin ${id} not found`,
    ALREADY_LOADED: (id: string) => `Plugin ${id} is already loaded`,
    NOT_LOADED: (id: string) => `Plugin ${id} is not loaded`,
    ALREADY_STARTED: (id: string) => `Plugin ${id} is already started`
  } as const;

  constructor(
    private readonly logger: Logger,
    private readonly context: Omit<PluginContext, 'logger'>
  ) {
    super();
  }

  /**
   * Register a plugin
   */
  async register(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(this.ERRORS.ALREADY_REGISTERED(plugin.id));
    }

    this.plugins.set(plugin.id, plugin);
    this.pluginStatus.set(plugin.id, { loaded: false, started: false });

    this.logger.info('Plugin registered', {
      pluginId: plugin.id,
      name: plugin.name,
      version: plugin.version,
      type: plugin.type,
      totalPlugins: this.plugins.size
    });
    this.emit('plugin:registered', { id: plugin.id, name: plugin.name, version: plugin.version });
  }

  /**
   * Load all registered plugins
   */
  async loadAll(): Promise<PluginLoadResult[]> {
    const results: PluginLoadResult[] = [];
    const totalPlugins = this.plugins.size;

    this.logger.info('Loading all plugins', { totalPlugins });

    for (const [id, plugin] of this.plugins) {
      try {
        await this.load(id);
        results.push({ id, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ id, success: false, error: message });
        this.logger.error('Failed to load plugin', {
          pluginId: id,
          error: message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info('Plugin loading complete', {
      total: totalPlugins,
      success: successCount,
      failed: totalPlugins - successCount
    });

    return results;
  }

  /**
   * Load a specific plugin
   */
  async load(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(this.ERRORS.NOT_FOUND(pluginId));
    }

    const status = this.pluginStatus.get(pluginId);
    if (status?.loaded) {
      throw new Error(this.ERRORS.ALREADY_LOADED(pluginId));
    }

    const context: PluginContext = {
      ...this.context,
      logger: this.logger.child({ plugin: pluginId })
    };

    await plugin.initialize(context);

    status!.loaded = true;
    this.logger.info('Plugin loaded', {
      pluginId,
      name: plugin.name,
      version: plugin.version
    });
    this.emit('plugin:loaded', { id: pluginId });
  }

  /**
   * Start a plugin
   */
  async start(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(this.ERRORS.NOT_FOUND(pluginId));
    }

    const status = this.pluginStatus.get(pluginId);
    if (!status?.loaded) {
      throw new Error(this.ERRORS.NOT_LOADED(pluginId));
    }

    if (status.started) {
      throw new Error(this.ERRORS.ALREADY_STARTED(pluginId));
    }

    await plugin.start();

    status.started = true;
    this.logger.info('Plugin started', {
      pluginId,
      name: plugin.name
    });
    this.emit('plugin:started', { id: pluginId });
  }

  /**
   * Start all loaded plugins
   */
  async startAll(): Promise<void> {
    const loadedPlugins = Array.from(this.pluginStatus.entries())
      .filter(([_, status]) => status.loaded && !status.started)
      .map(([id]) => id);

    this.logger.info('Starting all loaded plugins', {
      count: loadedPlugins.length
    });

    for (const id of loadedPlugins) {
      await this.start(id);
    }
  }

  /**
   * Stop a plugin
   */
  async stop(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      this.logger.warn('Cannot stop plugin: not found', { pluginId });
      return;
    }

    const status = this.pluginStatus.get(pluginId);
    if (!status?.started) {
      this.logger.debug('Plugin already stopped', { pluginId });
      return;
    }

    await plugin.stop();

    status.started = false;
    this.logger.info('Plugin stopped', {
      pluginId,
      name: plugin.name
    });
    this.emit('plugin:stopped', { id: pluginId });
  }

  /**
   * Stop all running plugins
   */
  async stopAll(): Promise<void> {
    const runningPlugins = Array.from(this.pluginStatus.entries())
      .filter(([_, status]) => status.started)
      .map(([id]) => id);

    this.logger.info('Stopping all running plugins', {
      count: runningPlugins.length
    });

    for (const id of runningPlugins) {
      await this.stop(id);
    }
  }

  /**
   * Unload a plugin
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(this.ERRORS.NOT_FOUND(pluginId));
    }

    const status = this.pluginStatus.get(pluginId);
    if (status?.started) {
      await this.stop(pluginId);
    }

    this.pluginStatus.delete(pluginId);
    this.plugins.delete(pluginId);

    this.logger.info('Plugin unloaded', {
      pluginId,
      remainingPlugins: this.plugins.size
    });
    this.emit('plugin:unloaded', { id: pluginId });
  }

  /**
   * Get plugin info
   */
  getInfo(pluginId: string): PluginInfo | null {
    const plugin = this.plugins.get(pluginId);
    const status = this.pluginStatus.get(pluginId);

    if (!plugin || !status) {
      return null;
    }

    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      type: plugin.type,
      loaded: status.loaded,
      started: status.started,
      description: plugin.description
    };
  }

  /**
   * List all plugins
   */
  list(): PluginInfo[] {
    return Array.from(this.plugins.keys())
      .map(id => this.getInfo(id))
      .filter((info): info is PluginInfo => info !== null);
  }

  /**
   * Get plugin by ID
   */
  get<T extends Plugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T | undefined;
  }

  /**
   * Check if plugin exists
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get plugins by type
   */
  getByType<T extends Plugin>(type: PluginType): T[] {
    return Array.from(this.plugins.values())
      .filter(plugin => plugin.type === type) as T[];
  }
}
