/**
 * Plugin command - Manage plugins
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createLogger } from '@buuo/core';
import { PluginLoader } from '@buuo/core';
import { resolve } from 'node:path';

export const pluginCommand = new Command('plugin')
  .description('Plugin management commands')
  .alias('pl');

pluginCommand
  .command('list')
  .description('List available plugins')
  .option('-d, --dir <path>', 'Plugins directory', 'plugins')
  .action(async (options) => {
    const pluginDir = resolve(options.dir);

    console.log(chalk.cyan('🔌 Listing plugins'));
    console.log(chalk.gray(`Directory: ${pluginDir}`));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      const logger = await createLogger({ level: 'warn', usePino: false });
      const loader = new PluginLoader(logger);

      const plugins = await loader.discoverPlugins(pluginDir);

      if (plugins.length === 0) {
        console.log(chalk.yellow('No plugins found'));
      } else {
        for (const plugin of plugins) {
          console.log(chalk.white(`  ${plugin.name}`));
          console.log(chalk.gray(`    ID: ${plugin.id}`));
          console.log(chalk.gray(`    Version: ${plugin.version}`));
          console.log(chalk.gray(`    Type: ${plugin.type}`));
          console.log(chalk.gray(`    Description: ${plugin.description}`));
          if (plugin.author) {
            console.log(chalk.gray(`    Author: ${plugin.author}`));
          }
          console.log();
        }
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

pluginCommand
  .command('info <pluginId>')
  .description('Show plugin information')
  .option('-d, --dir <path>', 'Plugins directory', 'plugins')
  .action(async (pluginId, options) => {
    const pluginDir = resolve(options.dir);

    console.log(chalk.cyan(`🔌 Plugin: ${pluginId}`));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      const logger = await createLogger({ level: 'warn', usePino: false });
      const loader = new PluginLoader(logger);

      const plugins = await loader.discoverPlugins(pluginDir);
      const plugin = plugins.find(p => p.id === pluginId);

      if (!plugin) {
        console.log(chalk.yellow(`Plugin not found: ${pluginId}`));
        console.log(chalk.gray('Use "buuo plugin list" to see available plugins'));
      } else {
        console.log(chalk.white(`Name: ${plugin.name}`));
        console.log(chalk.gray(`ID: ${plugin.id}`));
        console.log(chalk.gray(`Version: ${plugin.version}`));
        console.log(chalk.gray(`Type: ${plugin.type}`));
        console.log(chalk.gray(`Description: ${plugin.description}`));
        if (plugin.author) {
          console.log(chalk.gray(`Author: ${plugin.author}`));
        }
        if (plugin.minBuuoVersion) {
          console.log(chalk.gray(`Min Buuo Version: ${plugin.minBuuoVersion}`));
        }
        if (plugin.dependencies) {
          console.log(chalk.gray(`Dependencies: ${Object.keys(plugin.dependencies).join(', ')}`));
        }
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

pluginCommand
  .command('validate <pluginPath>')
  .description('Validate a plugin')
  .action(async (pluginPath) => {
    const resolvedPath = resolve(pluginPath);

    console.log(chalk.cyan(`🔍 Validating plugin: ${resolvedPath}`));
    console.log(chalk.gray('─'.repeat(40)));

    try {
      const logger = await createLogger({ level: 'warn', usePino: false });
      const loader = new PluginLoader(logger);

      // Load manifest
      const manifest = await loader.loadManifest(resolvedPath);
      console.log(chalk.green('✓ Manifest valid'));

      // Validate dependencies
      const depCheck = await loader.validateDependencies(manifest);
      if (depCheck.valid) {
        console.log(chalk.green('✓ All dependencies satisfied'));
      } else {
        console.log(chalk.yellow('⚠ Missing dependencies:'));
        for (const dep of depCheck.missing || []) {
          console.log(chalk.gray(`    - ${dep}`));
        }
      }

      // Check entry point
      const entryPoint = loader.resolveEntryPoint(resolvedPath, manifest);
      const { existsSync } = await import('node:fs');
      if (existsSync(entryPoint)) {
        console.log(chalk.green('✓ Entry point exists'));
      } else {
        console.log(chalk.red(`✗ Entry point not found: ${entryPoint}`));
      }

      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.green('Plugin validation complete'));

    } catch (error) {
      console.error(chalk.red('✗ Validation failed:'), error);
      process.exit(1);
    }
  });
