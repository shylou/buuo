/**
 * Config command - Manage configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigStore } from '@buuo/core';
import { resolve } from 'node:path';

export const configCommand = new Command('config')
  .description('Configuration management commands')
  .alias('cfg');

configCommand
  .command('validate')
  .description('Validate configuration file')
  .option('-c, --config <path>', 'Configuration file path', 'config/default.config.yaml')
  .action(async (options) => {
    const configPath = resolve(options.config);

    console.log(chalk.cyan(`🔍 Validating configuration: ${configPath}`));

    try {
      const configStore = new ConfigStore({ path: configPath });
      await configStore.load();

      console.log(chalk.green('✓ Configuration is valid'));
      console.log(chalk.gray('─'.repeat(40)));

      // Show some config values
      const channels = configStore.get('channels', {});
      const providers = configStore.get('providers', {});

      console.log(`  Channels configured: ${Object.keys(channels).length}`);
      console.log(`  Providers configured: ${Object.keys(providers).length}`);

    } catch (error) {
      console.error(chalk.red('✗ Configuration validation failed:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('get <key>')
  .description('Get configuration value')
  .option('-c, --config <path>', 'Configuration file path', 'config/default.config.yaml')
  .action(async (key, options) => {
    const configPath = resolve(options.config);

    try {
      const configStore = new ConfigStore({ path: configPath });
      await configStore.load();

      const value = configStore.get(key);

      if (value === undefined) {
        console.log(chalk.yellow(`Key not found: ${key}`));
      } else {
        console.log(JSON.stringify(value, null, 2));
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set configuration value')
  .option('-c, --config <path>', 'Configuration file path', 'config/default.config.yaml')
  .action(async (key, value, options) => {
    const configPath = resolve(options.config);

    try {
      const configStore = new ConfigStore({ path: configPath, autoSave: true });
      await configStore.load();

      // Parse value
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string
      }

      configStore.set(key, parsedValue as any);
      await configStore.save();

      console.log(chalk.green(`✓ Set ${key} = ${JSON.stringify(parsedValue)}`));

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('init')
  .description('Initialize default configuration')
  .option('-o, --output <path>', 'Output file path', 'config/default.config.yaml')
  .action(async (options) => {
    const { writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const { mkdir } = await import('node:fs/promises');

    const outputPath = resolve(options.output);

    console.log(chalk.cyan(`📝 Creating configuration: ${outputPath}`));

    const defaultConfig = `# Buuo Configuration
# This is the default configuration file for Buuo

gateway:
  id: gateway_\${GATEWAY_ID}
  cleanupInterval: 300000  # 5 minutes

# Session management
session:
  maxHistory: 100
  timeout: 3600000  # 1 hour
  autoDelete: false

# Router configuration
router:
  defaultProvider: claude
  systemPrompt: |
    You are a helpful AI assistant.
  temperature: 0.7
  maxTokens: 4096
  stream: true

# Channel configurations
channels:
  telegram:
    - id: telegram-main
      token: \${TELEGRAM_BOT_TOKEN}
      enabled: true

  discord:
    - id: discord-main
      token: \${DISCORD_BOT_TOKEN}
      enabled: true

# AI Provider configurations
providers:
  claude:
    - id: claude-default
      apiKey: \${ANTHROPIC_API_KEY}
      model: claude-3-5-sonnet-20241022
      enabled: true

  openai:
    - id: openai-default
      apiKey: \${OPENAI_API_KEY}
      model: gpt-4
      enabled: false

# Security settings
security:
  pairingTTL: 300000  # 5 minutes
  sessionTTL: 86400000  # 24 hours
  adminUsers: []
`;

    try {
      // Create directory if needed
      await mkdir(dirname(outputPath), { recursive: true });

      // Write config
      await writeFile(outputPath, defaultConfig, 'utf-8');

      console.log(chalk.green('✓ Configuration created'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.yellow('Remember to:'));
      console.log(chalk.gray('  1. Set your API keys as environment variables'));
      console.log(chalk.gray('  2. Update channel configurations with your tokens'));
      console.log(chalk.gray('  3. Enable the providers you want to use'));

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });
