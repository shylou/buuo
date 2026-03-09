/**
 * Plugin Loader - Dynamic plugin loading from filesystem
 * @module plugins
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from '../utils/logger.js';

export interface PluginManifest {
  /** Plugin ID */
  id: string;

  /** Plugin name */
  name: string;

  /** Plugin version */
  version: string;

  /** Plugin description */
  description: string;

  /** Plugin type */
  type: string;

  /** Plugin author */
  author?: string;

  /** Main entry point */
  main: string;

  /** Plugin dependencies */
  dependencies?: Record<string, string>;

  /** Minimum Buuo version */
  minBuuoVersion?: string;
}

export interface PluginLoadOptions {
  /** Plugin directory path */
  pluginDir: string;

  /** Auto-start after load */
  autoStart?: boolean;

  /** Plugin configuration */
  config?: Record<string, unknown>;
}

export class PluginLoader {
  constructor(private readonly logger: Logger) {}

  /**
   * Load plugin manifest from directory
   */
  async loadManifest(pluginPath: string): Promise<PluginManifest> {
    const manifestPath = resolve(pluginPath, 'plugin.json');

    if (!existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as PluginManifest;

    // Validate required fields
    if (!manifest.id || !manifest.name || !manifest.version || !manifest.type || !manifest.main) {
      throw new Error(`Invalid plugin manifest: ${manifestPath}`);
    }

    return manifest;
  }

  /**
   * Resolve plugin entry point
   */
  resolveEntryPoint(pluginPath: string, manifest: PluginManifest): string {
    return resolve(pluginPath, manifest.main);
  }

  /**
   * Validate plugin dependencies
   */
  async validateDependencies(
    manifest: PluginManifest
  ): Promise<{ valid: boolean; missing?: string[] }> {
    if (!manifest.dependencies) {
      return { valid: true };
    }

    // Check if dependencies are available
    // This is a simplified check - real implementation would verify versions
    const missing: string[] = [];

    for (const [dep, version] of Object.entries(manifest.dependencies)) {
      try {
        // Try to require the dependency
        await import(dep);
      } catch {
        missing.push(`${dep}@${version}`);
      }
    }

    return {
      valid: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined
    };
  }

  /**
   * Discover plugins in directory
   */
  async discoverPlugins(dir: string): Promise<PluginManifest[]> {
    const plugins: PluginManifest[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const pluginPath = join(dir, entry.name);
        const manifestPath = join(pluginPath, 'plugin.json');

        if (!existsSync(manifestPath)) {
          continue;
        }

        try {
          const manifest = await this.loadManifest(pluginPath);
          plugins.push(manifest);
        } catch (error) {
          this.logger.warn(`Failed to load plugin manifest from ${pluginPath}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to discover plugins in ${dir}: ${error}`);
    }

    return plugins;
  }
}
