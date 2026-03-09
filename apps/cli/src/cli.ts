#!/usr/bin/env node
/**
 * Buuo CLI - Command-line interface for Buuo AI assistant
 */

import { Command } from 'commander';
import { gatewayCommand } from './commands/gateway.js';
import { configCommand } from './commands/config.js';
import { pluginCommand } from './commands/plugin.js';

const program = new Command();

program
  .name('buuo')
  .description('Buuo - Personal AI Assistant System')
  .version('0.1.0');

// Register commands
program.addCommand(gatewayCommand);
program.addCommand(configCommand);
program.addCommand(pluginCommand);

// Parse and execute
program.parseAsync(process.argv).catch(console.error);
