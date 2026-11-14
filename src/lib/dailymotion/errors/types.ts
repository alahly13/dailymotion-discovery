// Centralized Dailymotion API Error System — Typed Error Catalog & Core Types
//
// What this controls: Defines the canonical error catalog, categories, and normalized
// error data structure for all Dailymotion API communication (Legacy v1 and REST v2).
// Why it exists: Unifies error classification, prevents raw stack traces or leaked tokens,
// and ensures consistent user-facing messages and suggested remedies across all workspaces.
// Scope: Shared across server-side clients, routes, and client-side error presentations.
// Future maintainers: Add new failure codes here; never invent arbitrary string codes in components.

import type { ApiVersion } from "@/lib/discovery/types";

export type DailymotionErrorCategory =
  | "auth"
  | "http_provider"
  | "network"
  | "integration";

export type DailymotionErrorCode =
  // Authentication errors
  | "AUTH_MISSING_CREDENTIALS"
  | "AUTH_INVALID_CLIENT"
  | "AUTH_INVALID_SECRET"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_EXPIRED_TOKEN"
  | "AUTH_REFRESH_FAILED"
  | "AUTH_UNSUPPORTED_GRANT"
  | "AUTH_INVALID_SCOPE"
  | "AUTH_PERMISSION_DENIED"
  | "AUTH_UNAUTHORIZED"

  // HTTP and provider errors
  | "HTTP_BAD_REQUEST"              // 400
  | "HTTP_UNAUTHORIZED"             // 401
  | "HTTP_FORBIDDEN"                // 403
  | "HTTP_NOT_FOUND"                // 404
  | "HTTP_METHOD_NOT_ALLOWED"       // 405
  | "HTTP_REQUEST_TIMEOUT"          // 408
  | "HTTP_CONFLICT"                 // 409
  | "HTTP_GONE"                     // 410
  | "HTTP_VALIDATION_ERROR"         // 422
  | "HTTP_TOO_MANY_REQUESTS"        // 429
  | "HTTP_INTERNAL_SERVER_ERROR"    // 500
  | "HTTP_BAD_GATEWAY"              // 502
  | "HTTP_SERVICE_UNAVAILABLE"      // 503
  | "HTTP_GATEWAY_TIMEOUT"          // 504
  | "HTTP_UNEXPECTED_STATUS"

  // Network and infrastructure errors
  | "NETWORK_DNS_FAILURE"
  | "NETWORK_CONNECTION_REFUSED"
  | "NETWORK_CONNECTION_RESET"
  | "NETWORK_TLS_ERROR"
  | "NETWORK_UNAVAILABLE"
  | "NETWORK_TIMEOUT"
  | "NETWORK_MALFORMED_JSON"
  | "NETWORK_UNEXPECTED_RESPONSE"
  | "NETWORK_EMPTY_RESPONSE"
  | "NETWORK_PAGINATION_FAILED"
  | "NETWORK_RATE_LIMIT_EXHAUSTED"

  // Application and integration errors
  | "APP_UNSUPPORTED_RESOURCE"
  | "APP_INVALID_URL"
  | "APP_INVALID_RESOURCE_ID"
  | "APP_RESOURCE_UNAVAILABLE"
  | "APP_RESOURCE_RESTRICTED"
  | "APP_MISSING_REQUIRED_FIELDS"
  | "APP_VERSION_MISMATCH"
  | "APP_INCORRECT_ENDPOINT"
  | "APP_UNSUPPORTED_FILTER"
  | "APP_INVALID_PARAM"
  | "APP_NORMALIZATION_FAILED"
  | "APP_INTERNAL_ERROR";

export interface DailymotionNormalizedError {
  /** Stable programmatic error code from the catalog */
  code: DailymotionErrorCode;
  /** Category for high-level classification */
  category: DailymotionErrorCategory;
  /** API version associated with the failure ("v1" | "v2" | "unknown") */
  apiVersion: ApiVersion | "unknown";
  /** HTTP status code (if an HTTP response was received) */
  httpStatus: number | null;
  /** Safe diagnostic message for technical logs (guaranteed free of secrets) */
  message: string;
  /** User-facing explanation suitable for direct presentation in UI alert components */
  userMessage: string;
  /** Clear actionable remedy guiding the user or operator */
  suggestedAction: string;
  /** Whether the operation is safe to retry automatically or manually */
  retryable: boolean;
  /** Correlation or request identifier if provided upstream or generated locally */
  requestId: string | null;
  /** ISO timestamp when the error occurred */
  timestamp: string;
  /** The endpoint invoked (e.g. "GET /videos", "GET /profiles/{id}") */
  endpoint: string | null;
  /** Resource type involved (e.g. "video", "channel", "playlist", "live") */
  resourceType: string | null;
  /** Safe provider details with any token/secret fields strictly redacted */
  safeProviderDetails?: Record<string, unknown> | null;
}
