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
  private readonly sessions = new Map<string, { userId: string; expiresAt: Date }>();

  constructor(
    private readonly options: AuthOptions = {},
    private readonly logger?: Logger
  ) {}

  /**
   * Generate a pairing code
   */
  async generatePairingCode(userId?: string): Promise<PairingCode> {
    const code = this.generateCode();
    const ttl = this.options.pairingTTL ?? 300000; // 5 minutes default

    const pairingCode: PairingCode = {
      code,
      userId,
      expiresAt: new Date(Date.now() + ttl),
      used: false,
      createdAt: new Date()
    };

    this.pairingCodes.set(code, pairingCode);
    this.logger?.info(`Pairing code generated: ${code}`);

    // Schedule cleanup
    setTimeout(() => {
      this.pairingCodes.delete(code);
    }, ttl);

    return pairingCode;
  }

  /**
   * Validate a pairing code
   */
  async validatePairingCode(code: string, userId: string): Promise<AuthResult> {
    const pairingCode = this.pairingCodes.get(code);

    if (!pairingCode) {
      return { success: false, error: 'Invalid pairing code' };
    }

    if (pairingCode.used) {
      return { success: false, error: 'Pairing code already used' };
    }

    if (pairingCode.expiresAt < new Date()) {
      this.pairingCodes.delete(code);
      return { success: false, error: 'Pairing code expired' };
    }

    // Check if code is for specific user
    if (pairingCode.userId && pairingCode.userId !== userId) {
      return { success: false, error: 'Pairing code not for this user' };
    }

    // Pair the user
    pairingCode.used = true;
    const user = await this.pairUser(userId);

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
      this.logger?.info(`User paired: ${userId}`);
    } else {
      user.paired = true;
      user.lastSeen = new Date();
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
      this.logger?.info(`User unpaired: ${userId}`);
    }

    // Invalidate sessions
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(token);
      }
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
    if (!user) return undefined;

    Object.assign(user, updates);
    user.lastSeen = new Date();

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
    if (!user) return;

    if (!user.permissions.includes(permission)) {
      user.permissions.push(permission);
      this.logger?.debug(`Permission granted: ${userId} -> ${permission}`);
    }
  }

  /**
   * Revoke permission from user
   */
  revokePermission(userId: string, permission: string): void {
    const user = this.users.get(userId);
    if (!user) return;

    const index = user.permissions.indexOf(permission);
    if (index > -1) {
      user.permissions.splice(index, 1);
      this.logger?.debug(`Permission revoked: ${userId} -> ${permission}`);
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
   * Get statistics
   */
  getStats(): {
    totalUsers: number;
    pairedUsers: number;
    activeSessions: number;
    activePairingCodes: number;
  } {
    return {
      totalUsers: this.users.size,
      pairedUsers: Array.from(this.users.values()).filter(u => u.paired).length,
      activeSessions: this.sessions.size,
      activePairingCodes: Array.from(this.pairingCodes.values()).filter(c => !c.used && c.expiresAt > new Date()).length
    };
  }

  /**
   * Create a session token
   */
  private createSession(userId: string): string {
    const token = this.generateToken();
    const ttl = this.options.sessionTTL ?? 86400000; // 24 hours default

    this.sessions.set(token, {
      userId,
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
