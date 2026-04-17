/**
 * Gateway command - Start and manage the gateway
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createLogger } from '@buuo/core';
import { ConfigStore } from '@buuo/core';
import { PluginManager } from '@buuo/core';
import { Gateway } from '@buuo/core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '@buuo/core';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PID_FILE_NAME = '.buuo_gateway.pid';

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error?.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

export function readPidFile(fs: typeof import('node:fs'), pidFile: string): number | undefined {
  if (!fs.existsSync(pidFile)) {
    return undefined;
  }

  const raw = fs.readFileSync(pidFile, 'utf-8').trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isNaN(pid) ? undefined : pid;
}

export function claimPidFile(fs: typeof import('node:fs'), pidFile: string, logger: Logger): void {
  const existingPid = readPidFile(fs, pidFile);

  if (existingPid !== undefined && existingPid !== process.pid) {
    if (isProcessRunning(existingPid)) {
      throw new Error(`Gateway is already running with PID ${existingPid}`);
    }

    logger.warn(`Removing stale PID file for non-running process ${existingPid}`);
    fs.unlinkSync(pidFile);
  }

  fs.writeFileSync(pidFile, process.pid.toString());
}

export function cleanupPidFile(fs: typeof import('node:fs'), pidFile: string, pid: number): void {
  const recordedPid = readPidFile(fs, pidFile);
  if (recordedPid === pid && fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

export interface GatewayRuntimeStatus {
  running: boolean;
  pid?: number;
  stalePid: boolean;
}

export function getGatewayRuntimeStatus(
  fs: typeof import('node:fs'),
  pidFile: string
): GatewayRuntimeStatus {
  const pid = readPidFile(fs, pidFile);

  if (pid === undefined) {
    return { running: false, stalePid: false };
  }

  if (isProcessRunning(pid)) {
    return { running: true, pid, stalePid: false };
  }

  cleanupPidFile(fs, pidFile, pid);
  return { running: false, pid, stalePid: true };
}

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
    const fs = await import('node:fs');
    const pidFile = resolve(PID_FILE_NAME);
    let pidClaimed = false;

    try {
      // Load environment variables from .env file
      try {
        const dotenv = await import('dotenv');
        const dotenvPath = resolve('.env');
        dotenv.config({ path: dotenvPath });
      } catch {
        // .env file not found, continue without it
      }

      // Initialize logger with consistent timestamp format
      const logger = await createLogger({
        level: 'info',
        usePino: false  // Use ConsoleLogger for consistent format
      });

      claimPidFile(fs, pidFile, logger);
      pidClaimed = true;

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

      try {
        // Import Codex provider plugin
        const codexProviderPath = resolve(__dirname, '../../../../packages/provider-codex/dist/index.js');
        const { CodexProviderPlugin } = await import(codexProviderPath);
        await pluginManager.register(new CodexProviderPlugin());
        logger.info('Registered built-in plugin: @buuo/provider-codex');
      } catch (error) {
        logger.warn(`Failed to load Codex provider plugin: ${error}`);
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

      console.log(chalk.gray(`PID file created: ${pidFile}`));

      // Clean up PID file on exit
      const cleanupOwnPidFile = () => cleanupPidFile(fs, pidFile, process.pid);

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      process.on('exit', cleanupOwnPidFile);

      if (!options.daemon) {
        console.log(chalk.gray('Press Ctrl+C to stop'));
      }

    } catch (error) {
      if (pidClaimed) {
        cleanupPidFile(fs, pidFile, process.pid);
      }
      console.error(chalk.red('Failed to start gateway:'), error);
      process.exit(1);
    }
  });

gatewayCommand
  .command('status')
  .description('Show gateway status')
  .option('-c, --config <path>', 'Configuration file path', 'config/default.config.yaml')
  .action(async (_options) => {
    const fs = await import('node:fs');
    const pidFile = resolve(PID_FILE_NAME);
    const status = getGatewayRuntimeStatus(fs, pidFile);

    console.log(chalk.cyan('🦐 Buuo Gateway Status'));
    console.log(chalk.gray('─'.repeat(40)));

    if (status.running) {
      console.log(chalk.green('● Running'));
      console.log(chalk.gray(`PID: ${status.pid}`));
      return;
    }

    if (status.stalePid) {
      console.log(chalk.yellow('○ Stopped (removed stale PID file)'));
      return;
    }

    console.log(chalk.red('○ Stopped'));
  });

gatewayCommand
  .command('stop')
  .description('Stop the gateway')
  .action(async () => {
    console.log(chalk.yellow('🛑 Stopping gateway...'));

    const fs = await import('node:fs');
    const pidFile = resolve(PID_FILE_NAME);

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
