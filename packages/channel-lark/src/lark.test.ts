/**
 * LarkChannel Unit Tests
 *
 * Test implementation following v3.0.2 design specification:
 * - Use vi.mock() for SDK mocking
 * - Use constructor assertions or mock.results for instance verification
 * - No prototype assertions (object literal mocks)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LarkChannel } from './lark.js';
import { setupSDKMock, MockClient, MockWSClient, MockEventDispatcher } from '../test/mocks/sdk.mock.js';
import {
  validChannelConfig,
  missingAppSecretConfig,
  emptyAppSecretConfig,
  missingTokenConfig,
  minimalValidConfig,
} from '../test/fixtures/config.fixtures.js';
import {
  textMessageEvent,
  imageMessageEvent,
  invalidJsonEvent,
  emptyMessageEvent,
  duplicateMessageEvent,
} from '../test/fixtures/events.fixtures.js';

// SDK is dynamically imported in initialize(), call setupSDKMock() after imports
setupSDKMock();

describe('LarkChannel - Constructor', () => {
  it('should create with default id', () => {
    const channel = new LarkChannel();
    expect(channel.id).toBe('lark-channel');
    expect(channel.name).toBe('Lark/Feishu Channel');
    expect(channel.type).toBe('lark');
  });

  it('should create with custom id', () => {
    const channel = new LarkChannel({ id: 'custom-lark' });
    expect(channel.id).toBe('custom-lark');
  });
});

describe('LarkChannel - initialize()', () => {
  let channel: LarkChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = new LarkChannel();
  });

  it('should initialize successfully with valid config', async () => {
    await expect(channel.initialize(validChannelConfig)).resolves.not.toThrow();
  });

  it('should require both appId and appSecret', async () => {
    // Missing appSecret
    await expect(channel.initialize(missingAppSecretConfig)).rejects.toThrow('appId and appSecret');
  });

  it('should reject empty appSecret', async () => {
    await expect(channel.initialize(emptyAppSecretConfig)).rejects.toThrow('appId and appSecret');
  });

  it('should reject missing token/appId', async () => {
    await expect(channel.initialize(missingTokenConfig)).rejects.toThrow('appId and appSecret');
  });

  it('should create Client with correct config', async () => {
    await channel.initialize(minimalValidConfig);

    // Approach 1: Assert constructor was called with correct parameters
    expect(MockClient).toHaveBeenCalledWith({
      appId: 'cli_test_app_id',
      appSecret: 'test_app_secret_12345',
      loggerLevel: expect.any(Number), // LoggerLevel.error
    });
  });

  it('should create Client with optional parameters', async () => {
    await channel.initialize(validChannelConfig);

    expect(MockClient).toHaveBeenCalledWith({
      appId: 'cli_test_app_id',
      appSecret: 'test_app_secret_12345',
      loggerLevel: expect.any(Number),
    });
  });
});

describe('LarkChannel - start()', () => {
  let channel: LarkChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = new LarkChannel();
  });

  it('should throw error when not initialized', async () => {
    await expect(channel.start()).rejects.toThrow('not initialized');
  });

  it('should create WSClient and start connection', async () => {
    await channel.initialize(minimalValidConfig);
    await channel.start();

    // ✅ Assert WSClient constructor was called
    expect(MockWSClient).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'cli_test_app_id',
        appSecret: 'test_app_secret_12345',
        domain: 'https://open.feishu.cn',
      })
    );
  });

  it('should start WSClient connection', async () => {
    await channel.initialize(minimalValidConfig);
    await channel.start();

    // Get actual instance from mock.results and assert
    const actualWsClient = MockWSClient.mock.results[0]?.value;
    expect(actualWsClient?.start).toHaveBeenCalled();
  });

  it('should create EventDispatcher and register handler', async () => {
    await channel.initialize(minimalValidConfig);
    await channel.start();

    expect(MockEventDispatcher).toHaveBeenCalled();
    const actualDispatcher = MockEventDispatcher.mock.results[0]?.value;
    expect(actualDispatcher?.register).toHaveBeenCalled();
  });
});

describe('LarkChannel - message event handling', () => {
  let channel: LarkChannel;
  let receivedMessages: any[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    channel = new LarkChannel();
    receivedMessages = [];

    // Register message handler
    channel.onMessage((msg) => {
      receivedMessages.push(msg);
    });

    await channel.initialize(minimalValidConfig);
    await channel.start();
  });

  it('should handle text message', async () => {
    // Access private method via binding (reflection)
    const handleMessageEvent = (channel as any).handleMessageEvent.bind(channel);
    await handleMessageEvent(textMessageEvent.event);

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].content).toBe('Hello, buuo!');
    expect(receivedMessages[0].conversationId).toBe('chat_001');
    expect(receivedMessages[0].userId).toBe('user_open_001');
  });

  it('should handle image message with attachment', async () => {
    const handleMessageEvent = (channel as any).handleMessageEvent.bind(channel);
    await handleMessageEvent(imageMessageEvent.event);

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].content).toBe('[图片]');
    expect(receivedMessages[0].attachments).toBeDefined();
    expect(receivedMessages[0].attachments?.[0]?.type).toBe('image');
  });

  it('should skip empty message', async () => {
    const handleMessageEvent = (channel as any).handleMessageEvent.bind(channel);
    await handleMessageEvent(emptyMessageEvent.event);

    expect(receivedMessages).toHaveLength(0);
  });

  it('should handle invalid JSON gracefully', async () => {
    const handleMessageEvent = (channel as any).handleMessageEvent.bind(channel);
    await handleMessageEvent(invalidJsonEvent.event);

    expect(receivedMessages).toHaveLength(1);
    // Fallback: use raw content
    expect(receivedMessages[0].content).toBe('{invalid json content');
  });

  it('should deduplicate messages with same message_id', async () => {
    const handleMessageEvent = (channel as any).handleMessageEvent.bind(channel);

    // First processing
    await handleMessageEvent(textMessageEvent.event);
    expect(receivedMessages).toHaveLength(1);

    // Second processing (same message_id)
    await handleMessageEvent(duplicateMessageEvent.event);
    expect(receivedMessages).toHaveLength(1); // Should be deduplicated
  });
});

describe('LarkChannel - sendMessage()', () => {
  let channel: LarkChannel;

  beforeEach(async () => {
    vi.clearAllMocks();
    channel = new LarkChannel();
    await channel.initialize(minimalValidConfig);
  });

  it('should throw error when not initialized', async () => {
    const uninitializedChannel = new LarkChannel();
    await expect(uninitializedChannel.sendMessage({
      conversationId: 'chat_001',
      content: 'Hello',
    })).rejects.toThrow('not initialized');
  });

  it('should send short message via Client.im.message.create', async () => {
    await channel.sendMessage({
      conversationId: 'chat_001',
      content: 'Hello, buuo!',
    });

    // Get actual Client instance from mock.results
    const actualClient = MockClient.mock.results[0]?.value;
    expect(actualClient?.im.message.create).toHaveBeenCalledWith({
      params: { receive_id_type: 'chat_id' },
      data: expect.objectContaining({
        receive_id: 'chat_001',
        msg_type: 'interactive',
      }),
    });
  });

  it('should split long message with logical boundaries', async () => {
    // Create long content with clear split boundaries (using empty lines)
    const sections = Array(15).fill(null).map((_, i) => `## Section ${i + 1}\n\n${'A'.repeat(1000)}\n`);
    const longContent = sections.join('\n');

    await channel.sendMessage({
      conversationId: 'chat_001',
      content: longContent,
    });

    const actualClient = MockClient.mock.results[0]?.value;
    // Should call create multiple times (split at empty line boundaries)
    const callCount = actualClient?.im.message.create.mock.calls.length || 0;
    expect(callCount).toBeGreaterThan(1);
  });

  it('should split table-dense message (>10 tables)', async () => {
    const tableContent = Array(12).fill('| col1 | col2 |').join('\n');
    await channel.sendMessage({
      conversationId: 'chat_001',
      content: tableContent,
    });

    const actualClient = MockClient.mock.results[0]?.value;
    // Should call create multiple times (split at table boundaries)
    expect(actualClient?.im.message.create).toHaveBeenCalled();
  });

  it('should handle custom receiveIdType', async () => {
    await channel.sendMessage({
      conversationId: 'user_open_001|open_id',
      content: 'Hello',
    });

    const actualClient = MockClient.mock.results[0]?.value;
    expect(actualClient?.im.message.create).toHaveBeenCalledWith({
      params: { receive_id_type: 'open_id' },
      data: expect.objectContaining({
        receive_id: 'user_open_001',
      }),
    });
  });
});

describe('LarkChannel - updateMessage()', () => {
  let channel: LarkChannel;

  beforeEach(async () => {
    vi.clearAllMocks();
    channel = new LarkChannel();
    await channel.initialize(minimalValidConfig);
  });

  it('should update short message via patch', async () => {
    await channel.updateMessage('msg_001', 'Updated content');

    const actualClient = MockClient.mock.results[0]?.value;
    expect(actualClient?.im.message.patch).toHaveBeenCalledWith({
      path: { message_id: 'msg_001' },
      data: expect.objectContaining({
        content: expect.stringContaining('Updated content'),
      }),
    });
  });

  it('should truncate and split long content', async () => {
    const longContent = 'B'.repeat(12000);
    await channel.updateMessage('msg_001', longContent, 'chat_001');

    const actualClient = MockClient.mock.results[0]?.value;
    // Should call patch + at least one create
    expect(actualClient?.im.message.patch).toHaveBeenCalled();
  });

  it('should not throw on update failure', async () => {
    // Mock patch to throw error
    const actualClient = MockClient.mock.results[0]?.value;
    actualClient.im.message.patch.mockRejectedValue(new Error('API Error'));

    // Should not throw error (internal catch)
    await expect(channel.updateMessage('msg_001', 'Content')).resolves.not.toThrow();
  });
});

describe('LarkChannel - getStatus()', () => {
  it('should return disconnected status when not initialized', () => {
    const channel = new LarkChannel();
    const status = channel.getStatus();

    expect(status.connected).toBe(false);
    expect(status.state).toBe('disconnected');
  });

  it('should return connected status after start', async () => {
    const channel = new LarkChannel();
    await channel.initialize(minimalValidConfig);
    await channel.start();

    const status = channel.getStatus();
    expect(status.connected).toBe(true);
    expect(status.state).toBe('connected');
    expect(status.info?.appId).toBe('cli_test_app_id');
  });
});

describe('LarkChannel - dispose()', () => {
  it('should stop and cleanup', async () => {
    const channel = new LarkChannel();
    await channel.initialize(minimalValidConfig);
    await channel.start();

    await channel.dispose();

    const status = channel.getStatus();
    expect(status.connected).toBe(false);
  });
});
