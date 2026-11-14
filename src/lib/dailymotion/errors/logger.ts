// Centralized Dailymotion API Error System — Structured Server-Side Logger
//
// What this controls: Structured, sanitized logging of all Dailymotion API interactions and errors.
// Why it exists: Provides deep operational visibility for debugging and audit trails
// without ever leaking client secrets, Bearer tokens, or personal identity details.
// Scope: Server-side API clients, route handlers, and background synchronizers.

import type { DailymotionNormalizedError } from "./types";
import { redactSensitiveData, redactSensitiveString } from "./redact";

export interface LogContext {
  retryAttempt?: number;
  userId?: string | null;
  correlationId?: string | null;
  durationMs?: number;
}

export function logDailymotionError(error: DailymotionNormalizedError, context?: LogContext): void {
  // Only log in server runtime
  if (typeof window !== "undefined") return;

  const logPayload = {
    timestamp: error.timestamp,
    level: "ERROR",
    system: "DailymotionDiscovery",
    apiVersion: error.apiVersion,
    code: error.code,
    category: error.category,
    httpStatus: error.httpStatus,
    endpoint: error.endpoint,
    resourceType: error.resourceType,
    retryable: error.retryable,
    requestId: error.requestId || context?.correlationId || null,
    attempt: context?.retryAttempt ?? 1,
    durationMs: context?.durationMs ?? null,
    technicalMessage: redactSensitiveString(error.message),
    suggestedAction: error.suggestedAction,
    providerDetails: error.safeProviderDetails ? redactSensitiveData(error.safeProviderDetails) : null,
  };

  // Safe structured console output
  console.error(`[DM_API_ERROR] [${error.apiVersion.toUpperCase()}] ${error.code} (${error.httpStatus ?? "NO_HTTP"}): ${logPayload.technicalMessage}`, JSON.stringify(logPayload));
}

export function logDailymotionApiCall(info: {
  apiVersion: string;
  endpoint: string;
  status: number;
  durationMs: number;
  attempt?: number;
}): void {
  if (typeof window !== "undefined") return;

  // Debug or development logging (safe)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DM_API_CALL] [${info.apiVersion.toUpperCase()}] ${info.endpoint} -> HTTP ${info.status} (${info.durationMs}ms) attempt ${info.attempt ?? 1}`);
  }
}
