/**
 * ChannelConfig 测试数据 Fixtures
 */

import type { ChannelConfig } from '@buuo/core';

/** 有效的 ChannelConfig（包含必需的 appSecret） */
export const validChannelConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {
    appSecret: 'test_app_secret_12345',
    encryptKey: 'optional_encrypt_key',
    verificationToken: 'optional_verify_token',
  },
};

/** 缺少 appSecret 的无效配置（应该抛错） */
export const missingAppSecretConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {},
};

/** appSecret 为空字符串的无效配置（应该抛错） */
export const emptyAppSecretConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {
    appSecret: '',
  },
};

/** 缺少 token/appId 的无效配置（应该抛错） */
export const missingTokenConfig: ChannelConfig = {
  token: '',
  options: {
    appSecret: 'test_app_secret_12345',
  },
};

/** 只有必需字段的最小有效配置 */
export const minimalValidConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {
    appSecret: 'test_app_secret_12345',
  },
};
