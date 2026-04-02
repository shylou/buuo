/**
 * ChannelConfig test data fixtures
 */

import type { ChannelConfig } from '@buuo/core';

/** Valid ChannelConfig with required appSecret */
export const validChannelConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {
    appSecret: 'test_app_secret_12345',
    encryptKey: 'optional_encrypt_key',
    verificationToken: 'optional_verify_token',
  },
};

/** Invalid config missing appSecret (should throw) */
export const missingAppSecretConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {},
};

/** Invalid config with empty appSecret string (should throw) */
export const emptyAppSecretConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {
    appSecret: '',
  },
};

/** Invalid config missing token/appId (should throw) */
export const missingTokenConfig: ChannelConfig = {
  token: '',
  options: {
    appSecret: 'test_app_secret_12345',
  },
};

/** Minimal valid config with only required fields */
export const minimalValidConfig: ChannelConfig = {
  token: 'cli_test_app_id',
  options: {
    appSecret: 'test_app_secret_12345',
  },
};
