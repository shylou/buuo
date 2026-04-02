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

// vi.mock 声明（在测试文件顶部）
export function setupSDKMock() {
  vi.mock('@larksuiteoapi/node-sdk', () => ({
    EventDispatcher: MockEventDispatcher,
    WSClient: MockWSClient,
    Client: MockClient,
    LoggerLevel: { error: 0, warn: 1, info: 2, debug: 3 },
  }));
}

// 注意：不导出预先构造的实例
// 使用构造函数断言：expect(MockWSClient).toHaveBeenCalledWith(...)
// 或从 mock.results 获取实际实例：const instance = MockWSClient.mock.results[0]?.value
