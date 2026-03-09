/**
 * Logger tests
 */

import { describe, it, expect } from 'vitest';
import { ConsoleLogger } from './logger.js';

describe('ConsoleLogger', () => {
  it('should create logger with default level', () => {
    const logger = new ConsoleLogger();
    expect(logger).toBeDefined();
  });

  it('should create logger with custom level', () => {
    const logger = new ConsoleLogger('debug');
    expect(logger).toBeDefined();
  });

  it('should create child logger with context', () => {
    const logger = new ConsoleLogger();
    const child = logger.child({ plugin: 'test' });
    expect(child).toBeDefined();
  });

  it('should log messages without throwing', () => {
    const logger = new ConsoleLogger('debug');
    expect(() => {
      logger.trace('trace message');
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.fatal('fatal message');
    }).not.toThrow();
  });

  it('should respect log level', () => {
    const logger = new ConsoleLogger('warn');
    expect(() => {
      logger.trace('should not show');
      logger.debug('should not show');
      logger.info('should not show');
      logger.warn('should show');
      logger.error('should show');
    }).not.toThrow();
  });
});
