/**
 * Provider Errors - Custom error types for provider operations
 * @module providers
 */

/**
 * Base error class for provider-related errors
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly providerId?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Error thrown when provider is not initialized
 */
export class ProviderNotInitializedError extends ProviderError {
  constructor(providerId: string) {
    super(
      `Provider '${providerId}' is not initialized. Call initialize() before using the provider.`,
      'PROVIDER_NOT_INITIALIZED',
      providerId
    );
    this.name = 'ProviderNotInitializedError';
  }
}

/**
 * Error thrown when provider is already initialized
 */
export class ProviderAlreadyInitializedError extends ProviderError {
  constructor(providerId: string) {
    super(
      `Provider '${providerId}' is already initialized.`,
      'PROVIDER_ALREADY_INITIALIZED',
      providerId
    );
    this.name = 'ProviderAlreadyInitializedError';
  }
}

/**
 * Error thrown when provider request fails
 */
export class ProviderRequestError extends ProviderError {
  constructor(
    providerId: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(
      `Provider '${providerId}' request failed: ${message}`,
      'PROVIDER_REQUEST_ERROR',
      providerId
    );
    this.name = 'ProviderRequestError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class ProviderRateLimitError extends ProviderError {
  constructor(
    providerId: string,
    public readonly resetAt: Date,
    public readonly retryAfter?: number
  ) {
    super(
      `Provider '${providerId}' rate limit exceeded. Retry after ${resetAt.toISOString()}`,
      'PROVIDER_RATE_LIMIT',
      providerId
    );
    this.name = 'ProviderRateLimitError';
  }
}
