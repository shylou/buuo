/**
 * Token estimation utilities
 */

/**
 * Estimate token count from text
 *
 * This provides a rough estimation assuming ~4 characters per token,
 * which works reasonably for English text. For accurate token counting:
 * - Use tiktoken for OpenAI models
 * - Use Anthropic's tokenizer for Claude models
 * - Use model-specific tokenizers when available
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
