/**
 * ChannelConfig 测试数据 Fixtures
 */
import type { ChannelConfig } from '@buuo/core';
/** 有效的 ChannelConfig（包含必需的 appSecret） */
export declare const validChannelConfig: ChannelConfig;
/** 缺少 appSecret 的无效配置（应该抛错） */
export declare const missingAppSecretConfig: ChannelConfig;
/** appSecret 为空字符串的无效配置（应该抛错） */
export declare const emptyAppSecretConfig: ChannelConfig;
/** 缺少 token/appId 的无效配置（应该抛错） */
export declare const missingTokenConfig: ChannelConfig;
/** 只有必需字段的最小有效配置 */
export declare const minimalValidConfig: ChannelConfig;
//# sourceMappingURL=config.fixtures.d.ts.map