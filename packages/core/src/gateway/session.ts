/**
 * Session Manager - Manages conversation sessions
 * @module gateway
 */

import type { IncomingMessage } from '../channels/index.js';
import type { ChatMessage } from '../providers/index.js';
import type { Logger } from '../utils/logger.js';

/** Session management constants */
const SESSION_CONSTANTS = {
  /** Default maximum messages to keep in history */
  DEFAULT_MAX_HISTORY: 100,
  /** Session ID prefix */
  SESSION_ID_PREFIX: 'sess_',
} as const;

export interface SessionOptions {
  /** Maximum messages to keep in history */
  maxHistory?: number;
}

export interface Session {
  /** Session ID */
  id: string;

  /** User ID */
  userId: string;

  /** Channel ID */
  channelId: string;

  /** Conversation ID */
  conversationId: string;

  /** Message history */
  messages: ChatMessage[];

  /** Session data */
  data: Record<string, unknown>;

  /** Created at */
  createdAt: Date;

  /** Last activity */
  lastActivity: Date;

  /** Is session active */
  active: boolean;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly userSessions = new Map<string, Set<string>>();
  private readonly conversationSessions = new Map<string, string>();
  private readonly activeSessionIds = new Set<string>(); // Track active sessions for O(1) lookup

  constructor(
    private readonly options: SessionOptions = {},
    private readonly logger?: Logger
  ) {}

  /**
   * Get or create session for a conversation
   */
  async getOrCreate(message: IncomingMessage): Promise<Session> {
    const sessionId = this.conversationSessions.get(message.conversationId);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session && session.active) {
        session.lastActivity = new Date();
        this.logger?.debug('Session reused', {
          sessionId,
          conversationId: message.conversationId
        });
        return session;
      }
    }

    return this.create(message);
  }

  /**
   * Create a new session
   */
  async create(message: IncomingMessage): Promise<Session> {
    const sessionId = this.generateSessionId(message);

    const session: Session = {
      id: sessionId,
      userId: message.userId,
      channelId: message.metadata?.channelId as string ?? 'unknown',
      conversationId: message.conversationId,
      messages: [],
      data: {},
      createdAt: new Date(),
      lastActivity: new Date(),
      active: true
    };

    this.sessions.set(sessionId, session);
    this.conversationSessions.set(message.conversationId, sessionId);
    this.activeSessionIds.add(sessionId);

    // Track by user
    if (!this.userSessions.has(message.userId)) {
      this.userSessions.set(message.userId, new Set());
    }
    this.userSessions.get(message.userId)!.add(sessionId);

    this.logger?.debug('Session created', {
      sessionId,
      conversationId: message.conversationId,
      userId: message.userId,
      channelId: session.channelId,
      totalSessions: this.sessions.size,
      activeSessions: this.activeSessionIds.size
    });
    return session;
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by conversation ID
   */
  getByConversation(conversationId: string): Session | undefined {
    const sessionId = this.conversationSessions.get(conversationId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Get all sessions for a user
   */
  getByUser(userId: string): Session[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is Session => s !== undefined);
  }

  /**
   * Add message to session history
   */
  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.warn('Cannot add message: session not found', { sessionId });
      return;
    }

    session.messages.push(message);
    session.lastActivity = new Date();

    // Trim history if needed
    const maxHistory = this.options.maxHistory ?? SESSION_CONSTANTS.DEFAULT_MAX_HISTORY;
    if (session.messages.length > maxHistory) {
      const removedCount = session.messages.length - maxHistory;
      session.messages = session.messages.slice(-maxHistory);
      this.logger?.debug('Session history trimmed', {
        sessionId,
        removedCount,
        remainingCount: session.messages.length,
        maxHistory
      });
    }
  }

  /**
   * Update session data
   */
  updateData(sessionId: string, data: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.warn('Cannot update data: session not found', { sessionId });
      return;
    }

    session.data = { ...session.data, ...data };
    session.lastActivity = new Date();

    this.logger?.debug('Session data updated', {
      sessionId,
      keysCount: Object.keys(data).length
    });
  }

  /**
   * Clear session history
   */
  clearHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.warn('Cannot clear history: session not found', { sessionId });
      return;
    }

    const previousLength = session.messages.length;
    session.messages = [];
    session.lastActivity = new Date();

    this.logger?.debug('Session history cleared', {
      sessionId,
      previousLength
    });
  }

  /**
   * Deactivate session
   */
  deactivate(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.warn('Cannot deactivate: session not found', { sessionId });
      return;
    }

    session.active = false;
    this.activeSessionIds.delete(sessionId);
    this.conversationSessions.delete(session.conversationId);

    const userSessions = this.userSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    this.logger?.debug('Session deactivated', {
      sessionId,
      conversationId: session.conversationId,
      remainingActiveSessions: this.activeSessionIds.size
    });
  }

  /**
   * Delete session
   */
  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.warn('Cannot delete: session not found', { sessionId });
      return;
    }

    this.sessions.delete(sessionId);
    this.activeSessionIds.delete(sessionId);
    this.conversationSessions.delete(session.conversationId);

    const userSessions = this.userSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    this.logger?.debug('Session deleted', {
      sessionId,
      conversationId: session.conversationId,
      remainingSessions: this.sessions.size
    });
  }

  /**
   * List all active sessions (optimized with activeSessionIds Set)
   */
  listActive(): Session[] {
    return Array.from(this.activeSessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is Session => s !== undefined && s.active);
  }

  /**
   * Get session statistics (optimized to avoid creating intermediate arrays)
   */
  getStats(): {
    total: number;
    active: number;
    byUser: number;
  } {
    return {
      total: this.sessions.size,
      active: this.activeSessionIds.size,
      byUser: this.userSessions.size
    };
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(message: IncomingMessage): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${SESSION_CONSTANTS.SESSION_ID_PREFIX}${message.conversationId}_${timestamp}_${random}`;
  }
}
