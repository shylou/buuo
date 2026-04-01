/**
 * Shared type definitions for provider implementations
 */

/** SDK message types from Anthropic Agent SDK */
export interface SDKMessage {
  type: string;
  [key: string]: unknown;
}

/** Assistant message content block */
export interface AssistantContentBlock {
  type: 'text' | 'thinking' | 'tool_use';
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
}

/** Assistant message from SDK */
export interface SDKAssistantMessage extends SDKMessage {
  type: 'assistant';
  message: {
    content: AssistantContentBlock[];
  };
}

/** Stream event from SDK */
export interface SDKStreamEvent extends SDKMessage {
  type: 'stream_event';
  event: {
    type: string;
    delta?: {
      type?: string;
      text?: string;
    };
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

/** Result message from SDK */
export interface SDKResultMessage extends SDKMessage {
  type: 'result';
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

/** Image attachment metadata */
export interface ImageAttachment {
  type: 'image';
  url?: string;
  metadata?: {
    platform?: string;
  };
}

/** Message types that should be ignored (not forwarded) */
export const IGNORED_MESSAGE_TYPES = [
  'user',
  'user_message_replay',
  'compact_boundary',
  'status',
  'local_command_output',
  'hook_started',
  'hook_progress',
  'hook_response',
  'tool_progress',
  'auth_status',
  'task_notification',
  'task_started',
  'task_progress',
  'files_persisted',
  'tool_use_summary',
  'rate_limit',
  'elicitation_complete',
  'prompt_suggestion',
] as const;
