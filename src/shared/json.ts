// ============================================================================
// JSON Utilities
// ============================================================================

/**
 * Parse a JSON string, returning `fallback` if the input is null/undefined or
 * fails to parse. Guards against a single corrupt or malformed DB row throwing
 * and breaking an entire query/result mapping.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
