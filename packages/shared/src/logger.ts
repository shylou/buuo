/**
 * Shared logger utility for provider implementations
 */

/** Create a timestamped logger for a provider */
export function createProviderLogger(providerName: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}]`, `[${providerName}]`, ...args);
  };
}

/** Create a debug logger (disabled by default) */
export function createDebugLogger(providerName: string, enabled = false): (...args: unknown[]) => void {
  if (!enabled) {
    return () => {
      // Debug logging disabled
    };
  }

  return (...args: unknown[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    console.log(`[${timestamp}] [DEBUG]`, `[${providerName}]`, ...args);
  };
}
