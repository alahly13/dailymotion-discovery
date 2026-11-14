// Centralized Dailymotion API Error System — Secret Redaction Engine
//
// What this controls: Deep recursive sanitization of arbitrary data objects, URLs,
// headers, and error messages before server-side logging or client transmission.
// Why it exists: Strictly prevents credentials, Bearer tokens, cookies, client secrets,
// or sensitive personal parameters from leaking into logs, browser responses, or error reports.
// Scope: Used by error logger, HTTP error normalizers, and diagnostic payloads.

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /auth_header/i,
  /cookie/i,
  /credential/i,
  /private_key/i,
  /api_key/i,
  /access_token/i,
  /refresh_token/i,
  /client_secret/i,
];

const TOKEN_STRING_REGEX = /\b(Bearer\s+)[A-Za-z0-9_\-\.]{15,}\b/gi;
const JWT_LIKE_REGEX = /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g;

/**
 * Redacts sensitive key-value pairs recursively from an object or array.
 * Safe for JSON-serializable payloads of arbitrary depth.
 */
export function redactSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    return redactSensitiveString(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        result[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        result[key] = redactSensitiveData(value);
      } else if (typeof value === "string") {
        result[key] = redactSensitiveString(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return input;
}

/**
 * Sanitizes sensitive tokens, Bearer strings, and JWT-like sequences from prose or query strings.
 */
export function redactSensitiveString(str: string): string {
  if (!str) return str;

  let sanitized = str.replace(TOKEN_STRING_REGEX, "$1[REDACTED]");
  sanitized = sanitized.replace(JWT_LIKE_REGEX, "[REDACTED_TOKEN]");

  // Redact URL query parameters like client_secret=... or access_token=...
  sanitized = sanitized.replace(/([?&](?:client_secret|access_token|key|secret)=)[^&]+/gi, "$1[REDACTED]");

  return sanitized;
}
