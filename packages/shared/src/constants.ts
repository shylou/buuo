/**
 * Shared constants for provider implementations
 */

/** Provider configuration defaults */
export const DEFAULT_TIMEOUT = 300000; // 5 minutes
export const DEFAULT_CLI_PATH = 'claude';
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Session management */
export const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Stream processing */
export const POLL_INTERVAL = 50;

/** Formatting limits */
export const MAX_LOG_LENGTH = 200;
export const MAX_TOOL_INPUT_LENGTH = 100;
export const MAX_IMAGE_PATH_LENGTH = 60;

/** Cancellation */
export const CANCEL_FORCE_KILL_TIMEOUT = 2500; // ms
