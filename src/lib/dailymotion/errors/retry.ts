// Centralized Dailymotion API Error System — Bounded Retry Strategy
//
// What this controls: Intelligent retry evaluation, backoff calculation with jitter,
// and Retry-After header parsing for Dailymotion API communication.
// Why it exists: Prevents aggressive retry stampedes during rate limits or provider outages
// while automatically recovering from transient network blips and gateway timeouts.
// Scope: Used by V1 and V2 HTTP clients.

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
};

/**
 * Parses the standard HTTP `Retry-After` header value (seconds or HTTP date).
 * Returns delay in milliseconds, or null if missing or unparseable.
 */
export function parseRetryAfterHeader(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();

  // Try parsing as integer seconds
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000); // Clamp to max 30s
  }

  // Try parsing as HTTP Date
  const dateTimestamp = Date.parse(trimmed);
  if (!Number.isNaN(dateTimestamp)) {
    const diff = dateTimestamp - Date.now();
    return Math.max(0, Math.min(diff, 30_000));
  }

  return null;
}

/**
 * Calculates exponential backoff with full jitter to avoid synchronized retry stampedes.
 */
export function calculateBackoffMs(
  attempt: number,
  baseDelayMs = DEFAULT_RETRY_OPTIONS.baseDelayMs,
  maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
  retryAfterMs?: number | null
): number {
  if (retryAfterMs !== null && retryAfterMs !== undefined && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }

  // Exponential backoff: base * 2^attempt
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const clamped = Math.min(exponential, maxDelayMs);

  // Apply full jitter: uniform random in [baseDelayMs, clamped]
  const jitter = Math.floor(baseDelayMs + Math.random() * (clamped - baseDelayMs + 1));
  return Math.min(jitter, maxDelayMs);
}

/**
 * Determines whether an HTTP status code is safe and appropriate to retry.
 */
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 429) return true; // Rate limiting
  if (status === 502) return true; // Bad Gateway
  if (status === 503) return true; // Service Unavailable
  if (status === 504) return true; // Gateway Timeout
  return false;
}
