/**
 * AuthManager tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthManager } from './auth.js';

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager({
      pairingTTL: 300000,
      sessionTTL: 86400000,
      adminUsers: ['admin-user']
    });
  });

  it('should generate pairing code', async () => {
    const code = await auth.generatePairingCode();

    expect(code).toBeDefined();
    expect(code.code).toBeDefined();
    expect(code.code.length).toBeGreaterThan(0);
    expect(code.used).toBe(false);
    expect(code.expiresAt).toBeInstanceOf(Date);
  });

  it('should validate pairing code', async () => {
    const pairingCode = await auth.generatePairingCode('user-123');
    const result = await auth.validatePairingCode(pairingCode.code, 'user-123');

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user?.id).toBe('user-123');
    expect(result.token).toBeDefined();
  });

  it('should reject invalid pairing code', async () => {
    const result = await auth.validatePairingCode('INVALID', 'user-123');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.user).toBeUndefined();
  });

  it('should reject used pairing code', async () => {
    const pairingCode = await auth.generatePairingCode();
    await auth.validatePairingCode(pairingCode.code, 'user-123');
    const result = await auth.validatePairingCode(pairingCode.code, 'user-456');

    expect(result.success).toBe(false);
    expect(result.error).toContain('already used');
  });

  it('should reject expired pairing code', async () => {
    // Create an already expired pairing code
    const expiredCode = {
      code: 'EXPIRED',
      userId: undefined,
      expiresAt: new Date(Date.now() - 1000), // Already expired
      used: false,
      createdAt: new Date(Date.now() - 10000)
    };

    // Manually add expired code to the auth manager's internal map
    (auth as any).pairingCodes.set('EXPIRED', expiredCode);

    const result = await auth.validatePairingCode('EXPIRED', 'user-123');

    expect(result.success).toBe(false);
    // Should be rejected (either as invalid or expired)
    expect(result.error).toBeDefined();
  });

  it('should reject pairing code for wrong user', async () => {
    const pairingCode = await auth.generatePairingCode('user-123');
    const result = await auth.validatePairingCode(pairingCode.code, 'user-456');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not for this user');
  });

  it('should check if user is paired', async () => {
    expect(auth.isPaired('user-123')).toBe(false);

    await auth.pairUser('user-123');
    expect(auth.isPaired('user-123')).toBe(true);
  });

  it('should pair user', async () => {
    const user = await auth.pairUser('user-123');

    expect(user.id).toBe('user-123');
    expect(user.paired).toBe(true);
    expect(user.roles).toContain('user');
  });

  it('should make admin users admin', async () => {
    const user = await auth.pairUser('admin-user');

    expect(user.admin).toBe(true);
    expect(user.roles).toContain('admin');
    expect(user.permissions).toContain('*');
  });

  it('should unpair user', async () => {
    await auth.pairUser('user-123');
    expect(auth.isPaired('user-123')).toBe(true);

    await auth.unpairUser('user-123');
    expect(auth.isPaired('user-123')).toBe(false);
  });

  it('should get user', async () => {
    await auth.pairUser('user-123');
    const user = auth.getUser('user-123');

    expect(user).toBeDefined();
    expect(user?.id).toBe('user-123');
  });

  it('should update user', async () => {
    await auth.pairUser('user-123');
    const updated = auth.updateUser('user-123', { displayName: 'Test User' });

    expect(updated?.displayName).toBe('Test User');
  });

  it('should check permissions', async () => {
    await auth.pairUser('user-123');

    expect(auth.hasPermission('user-123', 'any:permission')).toBe(false);

    auth.grantPermission('user-123', 'channel:send');
    expect(auth.hasPermission('user-123', 'channel:send')).toBe(true);
  });

  it('should grant permission to user', async () => {
    await auth.pairUser('user-123');
    auth.grantPermission('user-123', 'channel:send');

    expect(auth.hasPermission('user-123', 'channel:send')).toBe(true);
  });

  it('should revoke permission from user', async () => {
    await auth.pairUser('user-123');
    auth.grantPermission('user-123', 'channel:send');
    expect(auth.hasPermission('user-123', 'channel:send')).toBe(true);

    auth.revokePermission('user-123', 'channel:send');
    expect(auth.hasPermission('user-123', 'channel:send')).toBe(false);
  });

  it('should check wildcard permissions', async () => {
    await auth.pairUser('user-123');
    auth.grantPermission('user-123', 'channel:*');

    expect(auth.hasPermission('user-123', 'channel:send')).toBe(true);
    expect(auth.hasPermission('user-123', 'channel:read')).toBe(true);
  });

  it('should check admin permissions', async () => {
    const user = await auth.pairUser('admin-user');

    expect(auth.hasPermission('admin-user', 'any:permission')).toBe(true);
  });

  it('should validate session token', async () => {
    const pairingCode = await auth.generatePairingCode();
    const result = await auth.validatePairingCode(pairingCode.code, 'user-123');
    const token = result.token!;

    const session = auth.validateSession(token);
    expect(session.valid).toBe(true);
    expect(session.userId).toBe('user-123');
  });

  it('should reject invalid session token', () => {
    const session = auth.validateSession('invalid-token');
    expect(session.valid).toBe(false);
    expect(session.userId).toBeUndefined();
  });

  it('should list all users', async () => {
    await auth.pairUser('user-1');
    await auth.pairUser('user-2');

    const users = auth.listUsers();
    expect(users).toHaveLength(2);
  });

  it('should get statistics', async () => {
    await auth.pairUser('user-1');
    await auth.pairUser('user-2');
    await auth.unpairUser('user-2');

    const stats = auth.getStats();
    expect(stats.totalUsers).toBe(2);
    expect(stats.pairedUsers).toBe(1);
  });
});
