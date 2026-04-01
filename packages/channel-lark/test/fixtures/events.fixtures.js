/**
 * 飞书事件测试数据 Fixtures
 * 参考：packages/channel-lark/src/lark.ts 中的事件处理逻辑
 */
/** 文本消息事件 */
export const textMessageEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_text_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000000',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: {
            message_id: 'msg_text_001',
            root_id: null,
            parent_id: null,
            create_time: '1712000000000',
            chat_id: 'chat_001',
            chat_type: 'group',
            message_type: 'text',
            content: '{"text":"Hello, buuo!"}',
            mentions: null,
        },
    },
};
/** 图片消息事件 */
export const imageMessageEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_image_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000000',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: {
            message_id: 'msg_image_001',
            root_id: null,
            parent_id: null,
            create_time: '1712000000000',
            chat_id: 'chat_001',
            chat_type: 'group',
            message_type: 'image',
            content: '{"image_key":"img_v2_abc123"}',
            mentions: null,
        },
    },
};
/** 长消息事件（>15000字符，需要分割） */
export const longMessageEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_long_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000000',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: {
            message_id: 'msg_long_001',
            root_id: null,
            parent_id: null,
            create_time: '1712000000000',
            chat_id: 'chat_001',
            chat_type: 'group',
            message_type: 'text',
            content: JSON.stringify({ text: 'A'.repeat(16000) }),
            mentions: null,
        },
    },
};
/** 表格密集消息（>10个表格，按表格边界分割） */
export const tableDenseMessageEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_table_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000000',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: {
            message_id: 'msg_table_001',
            root_id: null,
            parent_id: null,
            create_time: '1712000000000',
            chat_id: 'chat_001',
            chat_type: 'group',
            message_type: 'text',
            content: JSON.stringify({
                text: Array(12).fill('<table>').join('\n')
            }),
            mentions: null,
        },
    },
};
/** 无效 JSON content 的消息（测试降级处理） */
export const invalidJsonEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_invalid_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000000',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: {
            message_id: 'msg_invalid_001',
            root_id: null,
            parent_id: null,
            create_time: '1712000000000',
            chat_id: 'chat_001',
            chat_type: 'group',
            message_type: 'text',
            content: '{invalid json content',
            mentions: null,
        },
    },
};
/** 空 message 字段的事件 */
export const emptyMessageEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_empty_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000000',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: null,
    },
};
/** 用于测试去重的重复 message_id 事件 */
export const duplicateMessageEvent = {
    schema: 'im.message.receive_v1',
    header: {
        event_id: 'event_dup_001',
        event_type: 'im.message.receive_v1',
        create_time: '1712000000001',
        tenant_key: 'test_tenant',
        app_id: 'test_app_id',
    },
    event: {
        sender: {
            sender_id: {
                open_id: 'user_open_001',
                union_id: 'user_union_001',
                user_id: 'user_001',
            },
            sender_type: 'user',
            tenant_key: 'test_tenant',
        },
        message: {
            message_id: 'msg_text_001', // 与 textMessageEvent 相同的 message_id
            root_id: null,
            parent_id: null,
            create_time: '1712000001000',
            chat_id: 'chat_001',
            chat_type: 'group',
            message_type: 'text',
            content: '{"text":"Duplicate message"}',
            mentions: null,
        },
    },
};
//# sourceMappingURL=events.fixtures.js.map