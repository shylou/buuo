/**
 * 飞书事件测试数据 Fixtures
 * 参考：packages/channel-lark/src/lark.ts 中的事件处理逻辑
 */
import type { LarkEvent } from '../../src/types.js';
/** 文本消息事件 */
export declare const textMessageEvent: LarkEvent;
/** 图片消息事件 */
export declare const imageMessageEvent: LarkEvent;
/** 长消息事件（>15000字符，需要分割） */
export declare const longMessageEvent: LarkEvent;
/** 表格密集消息（>10个表格，按表格边界分割） */
export declare const tableDenseMessageEvent: LarkEvent;
/** 无效 JSON content 的消息（测试降级处理） */
export declare const invalidJsonEvent: LarkEvent;
/** 空 message 字段的事件 */
export declare const emptyMessageEvent: LarkEvent;
/** 用于测试去重的重复 message_id 事件 */
export declare const duplicateMessageEvent: LarkEvent;
//# sourceMappingURL=events.fixtures.d.ts.map