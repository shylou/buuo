/**
 * Authentication & Authorization - Security module for user management
 * @module security
 */

import type { Logger } from '../utils/logger.js';

export interface User {
  /** User ID */
  id: string;

  /** Username */
  username: string;

  /** Display name */
  displayName?: string;

  /** User roles */
  roles: string[];

  /** Permissions */
  permissions: string[];

  /** Is admin */
  admin: boolean;

  /** Paired state */
  paired: boolean;

  /** Created at */
  createdAt: Date;

  /** Last seen */
  lastSeen: Date;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface PairingCode {
  /** Code */
  code: string;

  /** User ID */
  userId?: string;

  /** Expires at */
  expiresAt: Date;

  /** Used */
  used: boolean;

  /** Created at */
  createdAt: Date;
}

export interface AuthOptions {
  /** Pairing code TTL in milliseconds */
  pairingTTL?: number;

  /** Session TTL in milliseconds */
  sessionTTL?: number;

  /** Auto-approve admin users */
  autoApproveAdmin?: boolean;

  /** Admin user IDs */
  adminUsers?: string[];
}

export interface AuthResult {
  /** Success */
  success: boolean;

  /** User */
  user?: User;

  /** Error message */
  error?: string;

  /** Session token */
  token?: string;
}

export class AuthManager {
  private readonly users = new Map<string, User>();
  private readonly pairingCodes = new Map<string, PairingCode>();
  private readonly userSessions = new Map<string, Set<string>>(); // userId -> Set of tokens
  private readonly sessions = new Map<string, { userId: string; expiresAt: Date }>();

  /** Default TTL constants */
  private readonly DEFAULTS = {
    PAIRING_TTL: 300000, // 5 minutes
    SESSION_TTL: 86400000 // 24 hours
  } as const;

  /** Error message templates */
  private readonly ERRORS = {
    INVALID_PAIRING_CODE: 'Invalid pairing code',
    PAIRING_CODE_USED: 'Pairing code already used',
    PAIRING_CODE_EXPIRED: 'Pairing code expired',
    PAIRING_CODE_MISMATCH: 'Pairing code not for this user'
  } as const;

  constructor(
    private readonly options: AuthOptions = {},
    private readonly logger?: Logger
  ) {}

  /**
   * Generate a pairing code
   */
  async generatePairingCode(userId?: string): Promise<PairingCode> {
    const code = this.generateCode();
    const ttl = this.options.pairingTTL ?? this.DEFAULTS.PAIRING_TTL;

    const pairingCode: PairingCode = {
      code,
      userId,
      expiresAt: new Date(Date.now() + ttl),
      used: false,
      createdAt: new Date()
    };

    this.pairingCodes.set(code, pairingCode);
    this.logger?.info('Pairing code generated', {
      code,
      userId,
      expiresAt: pairingCode.expiresAt,
      ttl
    });

    // Schedule cleanup
    setTimeout(() => {
      this.pairingCodes.delete(code);
      this.logger?.debug('Pairing code expired and cleaned up', { code });
    }, ttl);

    return pairingCode;
  }

  /**
   * Validate a pairing code
   */
  async validatePairingCode(code: string, userId: string): Promise<AuthResult> {
    const pairingCode = this.pairingCodes.get(code);

    if (!pairingCode) {
      this.logger?.warn('Pairing code validation failed', {
        code,
        userId,
        reason: 'not_found'
      });
      return { success: false, error: this.ERRORS.INVALID_PAIRING_CODE };
    }

    if (pairingCode.used) {
      this.logger?.warn('Pairing code validation failed', {
        code,
        userId,
        reason: 'already_used'
      });
      return { success: false, error: this.ERRORS.PAIRING_CODE_USED };
    }

    if (pairingCode.expiresAt < new Date()) {
      this.pairingCodes.delete(code);
      this.logger?.warn('Pairing code validation failed', {
        code,
        userId,
        reason: 'expired',
        expiredAt: pairingCode.expiresAt
      });
      return { success: false, error: this.ERRORS.PAIRING_CODE_EXPIRED };
    }

    // Check if code is for specific user
    if (pairingCode.userId && pairingCode.userId !== userId) {
      this.logger?.warn('Pairing code validation failed', {
        code,
        userId,
        expectedUserId: pairingCode.userId,
        reason: 'user_mismatch'
      });
      return { success: false, error: this.ERRORS.PAIRING_CODE_MISMATCH };
    }

    // Pair the user
    pairingCode.used = true;
    const user = await this.pairUser(userId);

    this.logger?.info('User paired successfully', {
      userId,
      code,
      isAdmin: user.admin
    });

    return {
      success: true,
      user,
      token: this.createSession(userId)
    };
  }

  /**
   * Check if user is paired
   */
  isPaired(userId: string): boolean {
    const user = this.users.get(userId);
    return user?.paired ?? false;
  }

  /**
   * Pair a user
   */
  async pairUser(userId: string): Promise<User> {
    let user = this.users.get(userId);

    if (!user) {
      const isAdmin = this.options.adminUsers?.includes(userId) ?? false;

      user = {
        id: userId,
        username: userId,
        roles: isAdmin ? ['admin'] : ['user'],
        permissions: isAdmin ? ['*'] : [],
        admin: isAdmin,
        paired: true,
        createdAt: new Date(),
        lastSeen: new Date()
      };

      this.users.set(userId, user);
      this.logger?.info('New user created and paired', {
        userId,
        isAdmin,
        roles: user.roles
      });
    } else {
      user.paired = true;
      user.lastSeen = new Date();
      this.logger?.debug('Existing user paired', { userId });
    }

    return user;
  }

  /**
   * Unpair a user
   */
  async unpairUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.paired = false;
      this.logger?.info('User unpaired', { userId });
    }

    // Invalidate sessions using userSessions index (O(1) lookup)
    const userTokens = this.userSessions.get(userId);
    if (userTokens) {
      let invalidatedCount = 0;
      for (const token of userTokens) {
        if (this.sessions.delete(token)) {
          invalidatedCount++;
        }
      }
      this.userSessions.delete(userId);
      this.logger?.debug('User sessions invalidated', {
        userId,
        count: invalidatedCount
      });
    }
  }

  /**
   * Get user
   */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /**
   * Update user
   */
  updateUser(userId: string, updates: Partial<User>): User | undefined {
    const user = this.users.get(userId);
    if (!user) {
      this.logger?.warn('Cannot update user: not found', { userId });
      return undefined;
    }

    Object.assign(user, updates);
    user.lastSeen = new Date();

    this.logger?.debug('User updated', {
      userId,
      updateKeys: Object.keys(updates)
    });

    return user;
  }

  /**
   * Check if user has permission
   */
  hasPermission(userId: string, permission: string): boolean {
    const user = this.users.get(userId);
    if (!user || !user.paired) return false;

    // Admin has all permissions
    if (user.admin || user.permissions.includes('*')) return true;

    // Check exact permission
    if (user.permissions.includes(permission)) return true;

    // Check wildcard permissions
    const parts = permission.split(':');
    for (let i = parts.length; i > 0; i--) {
      const wildcard = parts.slice(0, i).join(':') + ':*';
      if (user.permissions.includes(wildcard)) return true;
    }

    return false;
  }

  /**
   * Grant permission to user
   */
  grantPermission(userId: string, permission: string): void {
    const user = this.users.get(userId);
    if (!user) {
      this.logger?.warn('Cannot grant permission: user not found', { userId });
      return;
    }

    if (!user.permissions.includes(permission)) {
      user.permissions.push(permission);
      this.logger?.info('Permission granted', {
        userId,
        permission,
        totalPermissions: user.permissions.length
      });
    }
  }

  /**
   * Revoke permission from user
   */
  revokePermission(userId: string, permission: string): void {
    const user = this.users.get(userId);
    if (!user) {
      this.logger?.warn('Cannot revoke permission: user not found', { userId });
      return;
    }

    const index = user.permissions.indexOf(permission);
    if (index > -1) {
      user.permissions.splice(index, 1);
      this.logger?.info('Permission revoked', {
        userId,
        permission,
        remainingPermissions: user.permissions.length
      });
    }
  }

  /**
   * Validate session token
   */
  validateSession(token: string): { valid: boolean; userId?: string } {
    const session = this.sessions.get(token);

    if (!session) {
      return { valid: false };
    }

    if (session.expiresAt < new Date()) {
      this.sessions.delete(token);
      // Clean up userSessions index
      const userTokens = this.userSessions.get(session.userId);
      if (userTokens) {
        userTokens.delete(token);
        if (userTokens.size === 0) {
          this.userSessions.delete(session.userId);
        }
      }
      return { valid: false };
    }

    return { valid: true, userId: session.userId };
  }

  /**
   * List all users
   */
  listUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Get statistics (optimized to avoid creating temporary arrays)
   */
  getStats(): {
    totalUsers: number;
    pairedUsers: number;
    activeSessions: number;
    activePairingCodes: number;
  } {
    // Count paired users without creating array
    let pairedUsers = 0;
    const now = new Date();
    let activePairingCodes = 0;

    for (const user of this.users.values()) {
      if (user.paired) pairedUsers++;
    }

    for (const code of this.pairingCodes.values()) {
      if (!code.used && code.expiresAt > now) activePairingCodes++;
    }

    return {
      totalUsers: this.users.size,
      pairedUsers,
      activeSessions: this.sessions.size,
      activePairingCodes
    };
  }

  /**
   * Create a session token
   */
  private createSession(userId: string): string {
    const token = this.generateToken();
    const ttl = this.options.sessionTTL ?? this.DEFAULTS.SESSION_TTL;

    this.sessions.set(token, {
      userId,
      expiresAt: new Date(Date.now() + ttl)
    });

    // Update userSessions index
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(token);

    this.logger?.debug('Session created', {
      userId,
      ttl,
      expiresAt: new Date(Date.now() + ttl)
    });

    return token;
  }

  /**
   * Generate a random code
   */
  private generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Generate a random token
   */
  private generateToken(): string {
    return Array.from({ length: 32 }, () =>
      Math.random().toString(36).substring(2, 15)
    ).join('');
  }
}
