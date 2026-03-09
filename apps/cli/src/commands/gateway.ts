/**
 * Gateway command - Start and manage the gateway
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createLogger } from '@buuo/core';
import { ConfigStore } from '@buuo/core';
import { PluginManager } from '@buuo/core';
import { Gateway } from '@buuo/core';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const gatewayCommand = new Command('gateway')
  .description('Gateway commands')
  .alias('gw');

gatewayCommand
  .command('start')
  .description('Start the gateway')
  .option('-c, --config <path>', 'Configuration file path', 'config/default.config.yaml')
  .option('-d, --daemon', 'Run as daemon')
  .action(async (options) => {
    console.log(chalk.cyan('🦐 Buuo Gateway starting...'));

    try {
      // Load environment variables from .env file
      try {
        const dotenv = await import('dotenv');
        const dotenvPath = resolve('.env');
        dotenv.config({ path: dotenvPath });
      } catch {
        // .env file not found, continue without it
      }

      // Initialize logger
      const logger = await createLogger({ level: 'info' });

      // Load configuration
      const configPath = resolve(options.config);
      const configStore = new ConfigStore({ path: configPath, autoSave: false }, logger);
      await configStore.load();

      logger.info('Configuration loaded');

      // Create plugin manager
      const pluginManager = new PluginManager(logger, {
        gateway: null as any, // Will be set after gateway creation
        config: configStore,
        events: null as any,
        dataDir: resolve('plugins')
      });

      // Register built-in plugins
      try {
        // Import Lark channel plugin (use absolute path from project root)
        // Current: apps/cli/src/commands/gateway.ts → up 4 levels → packages/
        const larkPath = resolve(__dirname, '../../../../packages/channel-lark/dist/index.js');
        const { LarkChannelPlugin } = await import(larkPath);
        await pluginManager.register(new LarkChannelPlugin());
        logger.info('Registered built-in plugin: @buuo/channel-lark');
      } catch (error) {
        logger.warn(`Failed to load Lark channel plugin: ${error}`);
      }

      try {
        // Import Claude Code provider plugin
        const claudeCodePath = resolve(__dirname, '../../../../packages/provider-claude-code/dist/index.js');
        const { ClaudeCodeProviderPlugin } = await import(claudeCodePath);
        await pluginManager.register(new ClaudeCodeProviderPlugin());
        logger.info('Registered built-in plugin: @buuo/provider-claude-code');
      } catch (error) {
        logger.warn(`Failed to load Claude Code provider plugin: ${error}`);
      }

      // Create gateway - merge gateway config with router and session configs
      const gatewayConfig: Record<string, unknown> = {
        ...(configStore.get('gateway') as Record<string, unknown> || {}),
        router: configStore.get('router') || {},
        session: configStore.get('session') || {},
      };
      const gateway = new Gateway(
        gatewayConfig,
        pluginManager,
        configStore,
        logger
      );

      // Update plugin manager context
      (pluginManager as any).context.gateway = gateway;
      (pluginManager as any).context.events = gateway;

      // Initialize gateway
      await gateway.initialize();

      // Start gateway
      await gateway.start();

      console.log(chalk.green('✓ Gateway started successfully'));

      // Print status
      const status = gateway.getStatus();
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`  Channels: ${status.channels.connected}/${status.channels.total} connected`);
      console.log(`  Providers: ${status.providers.available}/${status.providers.total} available`);
      console.log(`  Sessions: ${status.sessions.active} active`);
      console.log(`  Plugins: ${status.plugins.started}/${status.plugins.total} started`);
      console.log(chalk.gray('─'.repeat(40)));

      // Handle shutdown
      const shutdown = async () => {
        console.log(chalk.yellow('\n🛑 Shutting down gateway...'));
        await gateway.stop();
        console.log(chalk.green('✓ Gateway stopped'));
        process.exit(0);
      };

      // Save PID file for stop command
      const fs = await import('node:fs');
      const pidFile = resolve('.buuo_gateway.pid');
      fs.writeFileSync(pidFile, process.pid.toString());
      console.log(chalk.gray(`PID file created: ${pidFile}`));

      // Clean up PID file on exit
      const cleanupPidFile = () => {
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile);
        }
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      process.on('exit', cleanupPidFile);

      if (!options.daemon) {
        console.log(chalk.gray('Press Ctrl+C to stop'));
      }

    } catch (error) {
      console.error(chalk.red('Failed to start gateway:'), error);
      process.exit(1);
    }
  });

gatewayCommand
  .command('status')
  .description('Show gateway status')
  .option('-c, --config <path>', 'Configuration file path', 'config/default.config.yaml')
  .action(async (options) => {
    console.log(chalk.cyan('🦐 Buuo Gateway Status'));
    console.log(chalk.gray('─'.repeat(40)));

    // This would connect to a running gateway
    // For now, just show a placeholder
    console.log(chalk.yellow('Gateway status command requires running gateway'));
    console.log(chalk.gray('Use "buuo gateway start" to start the gateway'));
  });

gatewayCommand
  .command('stop')
  .description('Stop the gateway')
  .action(async () => {
    console.log(chalk.yellow('🛑 Stopping gateway...'));

    const fs = await import('node:fs');
    const pidFile = resolve('.buuo_gateway.pid');

    // Check if PID file exists
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
      console.log(chalk.gray(`Found PID file with process: ${pid}`));

      try {
        // Check if process is running
        process.kill(pid, 0); // Signal 0 checks if process exists
        console.log(chalk.gray(`Sending SIGTERM to process ${pid}...`));

        // Send SIGTERM for graceful shutdown
        process.kill(pid, 'SIGTERM');

        // Wait a bit and check if it stopped
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          process.kill(pid, 0);
          // Still running, force kill
          console.log(chalk.yellow('Process still running, sending SIGKILL...'));
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process stopped
        }

        fs.unlinkSync(pidFile);
        console.log(chalk.green('✓ Gateway stopped'));
      } catch (error: any) {
        if (error.code === 'ESRCH') {
          console.log(chalk.yellow('Process not running, cleaning up PID file'));
          fs.unlinkSync(pidFile);
        } else {
          console.log(chalk.red('Failed to stop gateway:'), error.message);
        }
      }
    } else {
      console.log(chalk.yellow('No PID file found. Gateway may not be running.'));
      console.log(chalk.gray('Tip: Use Ctrl+C in the gateway terminal to stop it'));
    }
  });
