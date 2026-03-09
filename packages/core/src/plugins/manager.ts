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
      throw new Error(`Plugin ${plugin.id} is already registered`);
    }

    this.plugins.set(plugin.id, plugin);
    this.pluginStatus.set(plugin.id, { loaded: false, started: false });

    this.logger.info(`Plugin registered: ${plugin.id}@${plugin.version}`);
    this.emit('plugin:registered', { id: plugin.id, name: plugin.name, version: plugin.version });
  }

  /**
   * Load all registered plugins
   */
  async loadAll(): Promise<PluginLoadResult[]> {
    const results: PluginLoadResult[] = [];

    for (const [id, plugin] of this.plugins) {
      try {
        await this.load(id);
        results.push({ id, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ id, success: false, error: message });
      }
    }

    return results;
  }

  /**
   * Load a specific plugin
   */
  async load(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const status = this.pluginStatus.get(pluginId);
    if (status?.loaded) {
      throw new Error(`Plugin ${pluginId} is already loaded`);
    }

    const context: PluginContext = {
      ...this.context,
      logger: this.logger.child({ plugin: pluginId })
    };

    await plugin.initialize(context);

    status!.loaded = true;
    this.logger.info(`Plugin loaded: ${pluginId}`);
    this.emit('plugin:loaded', { id: pluginId });
  }

  /**
   * Start a plugin
   */
  async start(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const status = this.pluginStatus.get(pluginId);
    if (!status?.loaded) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    if (status.started) {
      throw new Error(`Plugin ${pluginId} is already started`);
    }

    await plugin.start();

    status.started = true;
    this.logger.info(`Plugin started: ${pluginId}`);
    this.emit('plugin:started', { id: pluginId });
  }

  /**
   * Start all loaded plugins
   */
  async startAll(): Promise<void> {
    for (const [id, status] of this.pluginStatus) {
      if (status.loaded && !status.started) {
        await this.start(id);
      }
    }
  }

  /**
   * Stop a plugin
   */
  async stop(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const status = this.pluginStatus.get(pluginId);
    if (!status?.started) {
      return;
    }

    await plugin.stop();

    status.started = false;
    this.logger.info(`Plugin stopped: ${pluginId}`);
    this.emit('plugin:stopped', { id: pluginId });
  }

  /**
   * Stop all running plugins
   */
  async stopAll(): Promise<void> {
    for (const [id, status] of this.pluginStatus) {
      if (status.started) {
        await this.stop(id);
      }
    }
  }

  /**
   * Unload a plugin
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const status = this.pluginStatus.get(pluginId);
    if (status?.started) {
      await this.stop(pluginId);
    }

    this.pluginStatus.delete(pluginId);
    this.plugins.delete(pluginId);

    this.logger.info(`Plugin unloaded: ${pluginId}`);
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
