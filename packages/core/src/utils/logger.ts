/**
 * Logger - Pino-based logging utility
 * @module utils
 */

import type { Logger as PinoLogger, LoggerOptions } from 'pino';

export interface LogEntry {
  /** Log level */
  level: LogLevel;

  /** Log message */
  msg: string;

  /** Timestamp */
  time: number;

  /** Additional context */
  [key: string]: unknown;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface Logger {
  /** Log trace message */
  trace(msg: string, ...args: unknown[]): void;

  /** Log debug message */
  debug(msg: string, ...args: unknown[]): void;

  /** Log info message */
  info(msg: string, ...args: unknown[]): void;

  /** Log warning message */
  warn(msg: string, ...args: unknown[]): void;

  /** Log error message */
  error(msg: string, ...args: unknown[]): void;

  /** Log fatal message */
  fatal(msg: string, ...args: unknown[]): void;

  /** Create child logger with additional context */
  child(bindings: Record<string, unknown>): Logger;
}

export class PinoLoggerAdapter implements Logger {
  constructor(private readonly pino: PinoLogger) {}

  trace(msg: string, ...args: unknown[]): void {
    this.pino.trace({ args }, msg);
  }

  debug(msg: string, ...args: unknown[]): void {
    this.pino.debug({ args }, msg);
  }

  info(msg: string, ...args: unknown[]): void {
    this.pino.info({ args }, msg);
  }

  warn(msg: string, ...args: unknown[]): void {
    this.pino.warn({ args }, msg);
  }

  error(msg: string, ...args: unknown[]): void {
    this.pino.error({ args }, msg);
  }

  fatal(msg: string, ...args: unknown[]): void {
    this.pino.fatal({ args }, msg);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PinoLoggerAdapter(this.pino.child(bindings));
  }
}

export class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel = 'info',
    private readonly context: Record<string, unknown> = {}
  ) {}

  // Unified timestamp function
  private getTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 23);
  }

  trace(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('trace')) {
      const ts = this.getTimestamp();
      console.trace(`[${ts}]`, '[TRACE]', this.format(msg), ...args);
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      const ts = this.getTimestamp();
      console.debug(`[${ts}]`, '[DEBUG]', this.format(msg), ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      const ts = this.getTimestamp();
      console.info(`[${ts}]`, '[INFO]', this.format(msg), ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      const ts = this.getTimestamp();
      console.warn(`[${ts}]`, '[WARN]', this.format(msg), ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      const ts = this.getTimestamp();
      console.error(`[${ts}]`, '[ERROR]', this.format(msg), ...args);
    }
  }

  fatal(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('fatal')) {
      const ts = this.getTimestamp();
      console.error(`[${ts}]`, '[FATAL]', this.format(msg), ...args);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.context, ...bindings });
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(msg: string): string {
    const ctx = Object.entries(this.context)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    return ctx ? `${msg} [${ctx}]` : msg;
  }
}

export interface LoggerFactoryOptions {
  /** Log level */
  level?: LogLevel;

  /** Use pino if available */
  usePino?: boolean;

  /** Pino options */
  pinoOptions?: LoggerOptions;

  /** Default context */
  context?: Record<string, unknown>;
}

let defaultLogger: Logger | null = null;

export async function createLogger(options: LoggerFactoryOptions = {}): Promise<Logger> {
  const { level = 'info', usePino = true, pinoOptions = {}, context = {} } = options;

  if (usePino) {
    try {
      const pino = await import('pino');
      const pinoLogger = pino.default({ level, ...pinoOptions });
      defaultLogger = new PinoLoggerAdapter(pinoLogger);
      return defaultLogger;
    } catch {
      // Pino not available, fall back to console
    }
  }

  defaultLogger = new ConsoleLogger(level, context);
  return defaultLogger;
}

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new ConsoleLogger();
  }
  return defaultLogger;
}

export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}
