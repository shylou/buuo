import { vi } from 'vitest';

// Mock EventDispatcher
export const MockEventDispatcher = vi.fn().mockImplementation(() => ({
  register: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  emit: vi.fn(),
}));

// Mock WSClient
export const MockWSClient = vi.fn().mockImplementation(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn().mockReturnThis(),
}));

// Mock Client
export const MockClient = vi.fn().mockImplementation((_config: any) => ({
  im: {
    message: {
      create: vi.fn().mockResolvedValue({
        data: { message_id: 'mock_msg_id' }
      }),
      patch: vi.fn().mockResolvedValue({})
    }
  },
  auth: {
    v3: {
      tenantAccessToken: {
        internal: vi.fn().mockResolvedValue({
          code: 0,
          tenant_access_token: 'mock_token',
          expire: 7200
        })
      }
    }
  }
}));

// Call in test file top-level scope for vi.mock hoisting
export function setupSDKMock() {
  vi.mock('@larksuiteoapi/node-sdk', () => ({
    EventDispatcher: MockEventDispatcher,
    WSClient: MockWSClient,
    Client: MockClient,
    Domain: { Feishu: 0, Lark: 1 },
    LoggerLevel: { error: 0, warn: 1, info: 2, debug: 3 },
  }));
}

// Note: do not export pre-constructed instances
// Use constructor assertions: expect(MockWSClient).toHaveBeenCalledWith(...)
// Or get actual instance from mock.results: const instance = MockWSClient.mock.results[0]?.value
