/**
 * SessionManager tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session.js';
import type { IncomingMessage } from '../channels/index.js';

describe('SessionManager', () => {
  let sessions: SessionManager;

  beforeEach(() => {
    sessions = new SessionManager({
      maxHistory: 10,
      timeout: 3600000,
      autoDelete: false
    });
  });

  function createMockMessage(overrides?: Partial<IncomingMessage>): IncomingMessage {
    return {
      id: 'msg-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
      timestamp: new Date(),
      metadata: { channelId: 'test' },
      ...overrides
    };
  }

  it('should create session for new conversation', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);

    expect(session.id).toBeDefined();
    expect(session.userId).toBe('user-1');
    expect(session.conversationId).toBe('conv-1');
    expect(session.active).toBe(true);
    expect(session.messages).toHaveLength(0);
  });

  it('should get or create session', async () => {
    const message = createMockMessage();

    const session1 = await sessions.getOrCreate(message);
    const session2 = await sessions.getOrCreate(message);

    expect(session1.id).toBe(session2.id);
  });

  it('should add messages to session', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);

    sessions.addMessage(session.id, { role: 'user', content: 'Hello' });
    sessions.addMessage(session.id, { role: 'assistant', content: 'Hi there' });

    expect(session.messages).toHaveLength(2);
    expect(session.messages[0].content).toBe('Hello');
    expect(session.messages[1].content).toBe('Hi there');
  });

  it('should trim message history', async () => {
    const sessionsLimited = new SessionManager({ maxHistory: 5 });
    const message = createMockMessage();
    const session = await sessionsLimited.create(message);

    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      sessionsLimited.addMessage(session.id, { role: 'user', content: `Message ${i}` });
    }

    // Should only keep last 5
    expect(session.messages.length).toBe(5);
    expect(session.messages[0].content).toBe('Message 5');
  });

  it('should update session data', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);

    sessions.updateData(session.id, { key: 'value' });

    expect(session.data.key).toBe('value');
  });

  it('should clear session history', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);

    sessions.addMessage(session.id, { role: 'user', content: 'Hello' });
    sessions.clearHistory(session.id);

    expect(session.messages).toHaveLength(0);
  });

  it('should deactivate session', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);

    sessions.deactivate(session.id);

    expect(session.active).toBe(false);
    expect(sessions.getByConversation('conv-1')).toBeUndefined();
  });

  it('should delete session', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);

    sessions.delete(session.id);

    expect(sessions.get(session.id)).toBeUndefined();
  });

  it('should get sessions by user', async () => {
    const msg1 = createMockMessage({ conversationId: 'conv-1' });
    const msg2 = createMockMessage({ conversationId: 'conv-2', userId: 'user-1' });
    const msg3 = createMockMessage({ conversationId: 'conv-3', userId: 'user-2' });

    await sessions.create(msg1);
    await sessions.create(msg2);
    await sessions.create(msg3);

    const user1Sessions = sessions.getByUser('user-1');
    expect(user1Sessions).toHaveLength(2);
  });

  it('should list active sessions', async () => {
    const msg1 = createMockMessage({ conversationId: 'conv-1' });
    const msg2 = createMockMessage({ conversationId: 'conv-2' });

    await sessions.create(msg1);
    await sessions.create(msg2);

    sessions.deactivate((await sessions.getOrCreate(msg1)).id);

    const active = sessions.listActive();
    expect(active).toHaveLength(1);
  });

  it('should get session statistics', () => {
    const stats = sessions.getStats();

    expect(stats).toHaveProperty('total', 0);
    expect(stats).toHaveProperty('active', 0);
    expect(stats).toHaveProperty('byUser', 0);
  });

  it('should update last activity on message add', async () => {
    const message = createMockMessage();
    const session = await sessions.create(message);
    const originalTime = session.lastActivity;

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));

    sessions.addMessage(session.id, { role: 'user', content: 'Test' });

    expect(session.lastActivity.getTime()).toBeGreaterThan(originalTime.getTime());
  });
});
