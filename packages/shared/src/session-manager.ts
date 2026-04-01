/**
 * Shared session management utilities for providers
 */

import { SESSION_TTL, SESSION_CLEANUP_INTERVAL } from './constants.js';

/** Type for logger function */
export type Logger = (...args: unknown[]) => void;

/** Session manager configuration */
export interface SessionManagerConfig {
  sessionTtl?: number;
  cleanupInterval?: number;
  logger?: Logger;
}

/** Session manager for handling session caching and cleanup */
export class SessionManager<K = string, V = string> {
  private readonly sessionMappings = new Map<K, V>();
  private readonly sessionExpiry = new Map<K, number>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly logger: Logger;

  constructor(config: SessionManagerConfig = {}) {
    this.logger = config.logger || (() => {});
    this.startSessionCleanup(config.sessionTtl || SESSION_TTL, config.cleanupInterval || SESSION_CLEANUP_INTERVAL);
  }

  /** Get session mapping for a key */
  get(key: K): V | undefined {
    return this.sessionMappings.get(key);
  }

  /** Set session mapping with expiry */
  set(key: K, value: V, ttl: number = SESSION_TTL): void {
    this.sessionMappings.set(key, value);
    this.sessionExpiry.set(key, Date.now() + ttl);
  }

  /** Check if session exists */
  has(key: K): boolean {
    return this.sessionMappings.has(key);
  }

  /** Delete session */
  delete(key: K): void {
    this.sessionMappings.delete(key);
    this.sessionExpiry.delete(key);
  }

  /** Clear all sessions */
  clear(): void {
    this.sessionMappings.clear();
    this.sessionExpiry.clear();
  }

  /** Get session count */
  get size(): number {
    return this.sessionMappings.size;
  }

  /** Get all mappings (copy) */
  getMappings(): Map<K, V> {
    return new Map(this.sessionMappings);
  }

  /** Update expiry time for existing session */
  refreshExpiry(key: K, ttl: number = SESSION_TTL): void {
    if (this.sessionMappings.has(key)) {
      this.sessionExpiry.set(key, Date.now() + ttl);
    }
  }

  /** Start periodic cleanup of expired sessions */
  private startSessionCleanup(sessionTtl: number, cleanupInterval: number): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanExpiredSessions();
    }, cleanupInterval);
  }

  /** Clean up expired sessions */
  private cleanExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, expiry] of this.sessionExpiry) {
      if (expiry < now) {
        this.sessionMappings.delete(key);
        this.sessionExpiry.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger(`Cleaned ${cleanedCount} expired sessions`);
    }
  }

  /** Stop cleanup timer and clear all sessions */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
    this.logger('Session manager destroyed');
  }
}
