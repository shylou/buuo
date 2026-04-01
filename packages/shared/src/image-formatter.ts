/**
 * Shared image attachment formatting utilities
 */

import type { ImageAttachment } from './types.js';

/** Format an image attachment for Claude providers */
export function formatImageAttachment(attachment: ImageAttachment): string {
  const imageUrl = attachment.url || '';
  const metadata = attachment.metadata || {};

  // Handle Lark platform images without URL
  if (!imageUrl && metadata.platform === 'lark') {
    return '(Lark image received. Please describe the image content for analysis.)';
  }

  // Handle local file paths
  if (imageUrl.startsWith('/') || imageUrl.startsWith('./')) {
    return `[Image: file://${imageUrl}]`;
  }

  // Handle HTTP/HTTPS URLs
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return `[Image: ${imageUrl}]`;
  }

  // Default fallback
  return '(Image received but cannot be displayed)';
}

/** Format tool input for display */
export function formatToolInput(input: unknown, maxLength = 100): string {
  if (!input) return '';

  if (typeof input === 'string') {
    return input.length > maxLength
      ? input.slice(0, maxLength) + '...'
      : input;
  }

  if (typeof input !== 'object' || input === null) {
    return String(input);
  }

  const obj = input as Record<string, unknown>;

  // Handle file references
  if (obj.file) {
    const file = String(obj.file);
    const maxImagePath = 60;
    return file.length > maxImagePath
      ? `📄 ${file.slice(0, 30)}...`
      : `📄 ${file}`;
  }

  // Handle search queries
  if (obj.query) {
    const query = String(obj.query);
    return `🔍 "${query.slice(0, 40)}..."`;
  }

  // Handle file paths
  if (obj.path) {
    const path = String(obj.path);
    const maxImagePath = 60;
    if (path.length > maxImagePath) {
      const parts = path.split('/');
      return `📁 ...${parts.slice(-2).join('/')}`;
    }
    return `📁 ${path}`;
  }

  // Default: format as object with keys
  const keys = Object.keys(obj).slice(0, 2);
  return keys.length > 2
    ? `{${keys.join(', ')}, ...}`
    : JSON.stringify(obj).slice(0, 80);
}
