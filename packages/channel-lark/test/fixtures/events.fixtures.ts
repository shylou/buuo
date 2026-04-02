/**
 * Lark event test data fixtures
 * Reference: packages/channel-lark/src/lark.ts event handling logic
 */

import type { LarkEvent } from '../../src/types.js';

/** Text message event */
export const textMessageEvent: LarkEvent = {
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

/** Image message event */
export const imageMessageEvent: LarkEvent = {
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

/** Long message event (>15000 chars, requires splitting) */
export const longMessageEvent: LarkEvent = {
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

/** Table-dense message (>10 tables, split by table boundary) */
export const tableDenseMessageEvent: LarkEvent = {
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

/** Invalid JSON content message (tests graceful degradation) */
export const invalidJsonEvent: LarkEvent = {
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

/** Event with null message field */
export const emptyMessageEvent: LarkEvent = {
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
    message: null as any,
  },
};

/** Duplicate message_id event for deduplication testing */
export const duplicateMessageEvent: LarkEvent = {
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
      message_id: 'msg_text_001', // Same message_id as textMessageEvent
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
