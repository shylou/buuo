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

/** Log level hierarchy for filtering */
const LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/** Default log level */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export class PinoLoggerAdapter implements Logger {
  constructor(private readonly pino: PinoLogger) {}

  private normalizeArgs(args: unknown[]): Record<string, unknown> {
    if (args.length === 0) return {};
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      return args[0] as Record<string, unknown>;
    }
    return { args };
  }

  trace(msg: string, ...args: unknown[]): void {
    this.pino.trace(this.normalizeArgs(args), msg);
  }

  debug(msg: string, ...args: unknown[]): void {
    this.pino.debug(this.normalizeArgs(args), msg);
  }

  info(msg: string, ...args: unknown[]): void {
    this.pino.info(this.normalizeArgs(args), msg);
  }

  warn(msg: string, ...args: unknown[]): void {
    this.pino.warn(this.normalizeArgs(args), msg);
  }

  error(msg: string, ...args: unknown[]): void {
    this.pino.error(this.normalizeArgs(args), msg);
  }

  fatal(msg: string, ...args: unknown[]): void {
    this.pino.fatal(this.normalizeArgs(args), msg);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PinoLoggerAdapter(this.pino.child(bindings));
  }
}

export class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel = DEFAULT_LOG_LEVEL,
    private readonly context: Record<string, unknown> = {}
  ) {}

  // Unified timestamp function
  private getTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 23);
  }

  // Format context object into string
  private formatContext(ctx: Record<string, unknown>): string {
    const entries = Object.entries(ctx)
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null) {
          return `${k}=${JSON.stringify(v)}`;
        }
        return `${k}=${v}`;
      })
      .join(' ');
    return entries;
  }

  trace(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('trace')) {
      const ts = this.getTimestamp();
      const baseCtx = this.formatContext(this.context);
      const ctxStr = baseCtx ? ` [${baseCtx}]` : '';
      console.trace(`[${ts}]`, '[TRACE]', msg + ctxStr, ...args);
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      const ts = this.getTimestamp();
      const baseCtx = this.formatContext(this.context);
      const ctxStr = baseCtx ? ` [${baseCtx}]` : '';
      console.debug(`[${ts}]`, '[DEBUG]', msg + ctxStr, ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      const ts = this.getTimestamp();
      const baseCtx = this.formatContext(this.context);
      const ctxStr = baseCtx ? ` [${baseCtx}]` : '';
      console.info(`[${ts}]`, '[INFO]', msg + ctxStr, ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      const ts = this.getTimestamp();
      const baseCtx = this.formatContext(this.context);
      const ctxStr = baseCtx ? ` [${baseCtx}]` : '';
      console.warn(`[${ts}]`, '[WARN]', msg + ctxStr, ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      const ts = this.getTimestamp();
      const baseCtx = this.formatContext(this.context);
      const ctxStr = baseCtx ? ` [${baseCtx}]` : '';
      console.error(`[${ts}]`, '[ERROR]', msg + ctxStr, ...args);
    }
  }

  fatal(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('fatal')) {
      const ts = this.getTimestamp();
      const baseCtx = this.formatContext(this.context);
      const ctxStr = baseCtx ? ` [${baseCtx}]` : '';
      console.error(`[${ts}]`, '[FATAL]', msg + ctxStr, ...args);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.context, ...bindings });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(this.level);
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
  const { level = DEFAULT_LOG_LEVEL, usePino = true, pinoOptions = {}, context = {} } = options;

  if (usePino) {
    try {
      const pino = await import('pino');
      const pinoLogger = pino.default({ level, ...pinoOptions });
      defaultLogger = new PinoLoggerAdapter(pinoLogger);
      return defaultLogger;
    } catch (error) {
      // Pino not available, fall back to console
      const fallbackLogger = new ConsoleLogger(level, context);
      // Log the fallback using console directly to avoid recursion
      console.warn('[Logger] Pino not available, using console logger', {
        error: error instanceof Error ? error.message : String(error)
      });
      return fallbackLogger;
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
