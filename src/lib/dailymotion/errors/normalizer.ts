// Centralized Dailymotion API Error System — Normalizer & Catalog Mapping
//
// What this controls: Normalizes diverse error representations (V1 `{error:{code,message}}`,
// V2 `{error:{code,message,correlation_id}}`, HTTP status codes, network/fetch exceptions)
// into a single canonical DailymotionNormalizedError shape.
// Why it exists: Enforces structured typing, secret redaction, user-facing clarity, and actionable guidance.
// Scope: Used by API clients, server route handlers, and Link Explorer.

import type { ApiVersion } from "@/lib/discovery/types";
import type { DailymotionErrorCode, DailymotionErrorCategory, DailymotionNormalizedError } from "./types";
import { redactSensitiveData, redactSensitiveString } from "./redact";
import { isRetryableHttpStatus } from "./retry";

export interface NormalizerInput {
  status?: number | null;
  rawJson?: unknown;
  error?: Error | unknown;
  apiVersion?: ApiVersion | "unknown";
  endpoint?: string | null;
  resourceType?: string | null;
  customCode?: DailymotionErrorCode;
  customMessage?: string;
  requestId?: string | null;
}

export function normalizeDailymotionError(input: NormalizerInput): DailymotionNormalizedError {
  const apiVersion = input.apiVersion ?? "unknown";
  const endpoint = input.endpoint ?? null;
  const resourceType = input.resourceType ?? null;
  const timestamp = new Date().toISOString();

  // Extract provider error fields if present in JSON
  const rawObj = (input.rawJson && typeof input.rawJson === "object" ? input.rawJson : {}) as Record<string, unknown>;
  const providerErrorObj = (rawObj.error && typeof rawObj.error === "object" ? rawObj.error : {}) as Record<string, unknown>;

  const providerMessage =
    typeof providerErrorObj.message === "string"
      ? providerErrorObj.message
      : typeof rawObj.error_message === "string"
      ? rawObj.error_message
      : typeof rawObj.message === "string"
      ? rawObj.message
      : null;

  const providerCodeRaw =
    providerErrorObj.code !== undefined
      ? String(providerErrorObj.code)
      : rawObj.error !== undefined && typeof rawObj.error === "string"
      ? rawObj.error
      : null;

  const correlationId =
    (typeof providerErrorObj.correlation_id === "string" ? providerErrorObj.correlation_id : null) ||
    (typeof rawObj.correlation_id === "string" ? rawObj.correlation_id : null) ||
    input.requestId ||
    null;

  const status =
    input.status ??
    (typeof providerErrorObj.code === "number" ? providerErrorObj.code : null);

  // Handle network exceptions (AbortError, fetch failed, DNS, offline)
  if (input.error instanceof Error) {
    const err = input.error;
    const msg = err.message.toLowerCase();

    if (err.name === "AbortError" || /timed?\s*out/i.test(msg)) {
      return {
        code: "NETWORK_TIMEOUT",
        category: "network",
        apiVersion,
        httpStatus: status ?? 408,
        message: redactSensitiveString(`Request timed out while contacting Dailymotion ${apiVersion.toUpperCase()}: ${err.message}`),
        userMessage: "The request to Dailymotion timed out. Please check your network connection and try again.",
        suggestedAction: "Retry the request. If the issue persists, the Dailymotion API may be experiencing high latency.",
        retryable: true,
        requestId: correlationId,
        timestamp,
        endpoint,
        resourceType,
        safeProviderDetails: null,
      };
    }

    if (/enotfound|dns|eai_again/i.test(msg)) {
      return {
        code: "NETWORK_DNS_FAILURE",
        category: "network",
        apiVersion,
        httpStatus: status ?? null,
        message: redactSensitiveString(`DNS resolution failed for Dailymotion API host: ${err.message}`),
        userMessage: "Unable to resolve Dailymotion servers. Please verify your internet connection or DNS configuration.",
        suggestedAction: "Check DNS settings or internet connectivity.",
        retryable: true,
        requestId: correlationId,
        timestamp,
        endpoint,
        resourceType,
        safeProviderDetails: null,
      };
    }

    if (/econnrefused|connection refused|network_error/i.test(msg)) {
      return {
        code: "NETWORK_CONNECTION_REFUSED",
        category: "network",
        apiVersion,
        httpStatus: status ?? 503,
        message: redactSensitiveString(`Connection refused by Dailymotion servers: ${err.message}`),
        userMessage: "Dailymotion servers could not be reached. The service may be temporarily unavailable.",
        suggestedAction: "Wait a few moments and try your search again.",
        retryable: true,
        requestId: correlationId,
        timestamp,
        endpoint,
        resourceType,
        safeProviderDetails: null,
      };
    }
  }

  // Handle explicit custom codes if passed
  if (input.customCode) {
    const customCode = input.customCode;
    const category: DailymotionErrorCategory = customCode.startsWith("AUTH_")
      ? "auth"
      : customCode.startsWith("HTTP_")
      ? "http_provider"
      : customCode.startsWith("NETWORK_")
      ? "network"
      : "integration";

    return {
      code: customCode,
      category,
      apiVersion,
      httpStatus: status ?? null,
      message: redactSensitiveString(input.customMessage || `Dailymotion error: ${customCode}`),
      userMessage: input.customMessage || "An operation error occurred on Dailymotion Discovery.",
      suggestedAction: "Review input parameters and retry.",
      retryable: false,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  // Map by HTTP status code & provider responses
  if (status === 400) {
    const isScopeError = providerMessage && /scope/i.test(providerMessage);
    if (isScopeError) {
      return {
        code: "AUTH_INVALID_SCOPE",
        category: "auth",
        apiVersion,
        httpStatus: 400,
        message: redactSensitiveString(providerMessage || "Invalid or unsupported OAuth scope requested."),
        userMessage: `Dailymotion rejected the requested ${apiVersion.toUpperCase()} API permission scope.`,
        suggestedAction:
          apiVersion === "v1"
            ? "Configure a valid Legacy Platform scope (e.g., manage_videos). Check DAILYMOTION_API_SCOPE_V1 in Settings."
            : "Configure valid API v2 read scopes (read_videos read_channels read_playlists read_users). Check DAILYMOTION_API_SCOPE_V2 in Settings.",
        retryable: false,
        requestId: correlationId,
        timestamp,
        endpoint,
        resourceType,
        safeProviderDetails: redactSensitiveData(rawObj),
      };
    }

    return {
      code: "HTTP_BAD_REQUEST",
      category: "http_provider",
      apiVersion,
      httpStatus: 400,
      message: redactSensitiveString(providerMessage || "Bad Request submitted to Dailymotion."),
      userMessage: "The request contains invalid parameters or unsupported syntax.",
      suggestedAction: "Check your search terms, filters, and query parameters before resubmitting.",
      retryable: false,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  if (status === 401) {
    const isTokenExpired = Boolean(providerCodeRaw === "AUTHORIZATION_EXPIRED" || (providerMessage && /expired/i.test(providerMessage)));
    return {
      code: isTokenExpired ? "AUTH_EXPIRED_TOKEN" : "HTTP_UNAUTHORIZED",
      category: "auth",
      apiVersion,
      httpStatus: 401,
      message: redactSensitiveString(providerMessage || "Unauthorized: API credentials missing, rejected, or token expired."),
      userMessage: isTokenExpired
        ? "Your Dailymotion API session token has expired."
        : "Dailymotion authentication failed. Please verify the API credentials for this version.",
      suggestedAction: isTokenExpired
        ? "Retry the request to automatically acquire a fresh access token."
        : `Check the ${apiVersion.toUpperCase()} API Key and Secret in Settings or deployment environment variables.`,
      retryable: isTokenExpired,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  if (status === 403) {
    return {
      code: "HTTP_FORBIDDEN",
      category: "http_provider",
      apiVersion,
      httpStatus: 403,
      message: redactSensitiveString(providerMessage || "Access forbidden by Dailymotion."),
      userMessage: "You do not have permission to view or access this resource on Dailymotion.",
      suggestedAction: "The requested item may be private, geo-restricted, or require specific partner privileges.",
      retryable: false,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  if (status === 404) {
    return {
      code: "HTTP_NOT_FOUND",
      category: "http_provider",
      apiVersion,
      httpStatus: 404,
      message: redactSensitiveString(providerMessage || "Requested resource was not found on Dailymotion."),
      userMessage: "The requested video, channel, playlist, or user could not be found.",
      suggestedAction: "Verify the URL, ID, or handle spelling. The resource may have been deleted or made private.",
      retryable: false,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  if (status === 422) {
    return {
      code: "HTTP_VALIDATION_ERROR",
      category: "http_provider",
      apiVersion,
      httpStatus: 422,
      message: redactSensitiveString(providerMessage || "Validation error: Dailymotion rejected one or more fields."),
      userMessage: "Dailymotion rejected the submitted fields or parameters.",
      suggestedAction: "Check specific filter formats such as dates, durations, or category codes.",
      retryable: false,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  if (status === 429) {
    return {
      code: "HTTP_TOO_MANY_REQUESTS",
      category: "http_provider",
      apiVersion,
      httpStatus: 429,
      message: redactSensitiveString(providerMessage || "Dailymotion rate limit exceeded."),
      userMessage: "Dailymotion API rate limit reached. Please wait before submitting more requests.",
      suggestedAction: "Pause queries briefly to allow rate limit quotas to reset.",
      retryable: true,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  if (status && status >= 500) {
    const isRetryable = isRetryableHttpStatus(status);
    return {
      code: status === 502 ? "HTTP_BAD_GATEWAY" : status === 503 ? "HTTP_SERVICE_UNAVAILABLE" : status === 504 ? "HTTP_GATEWAY_TIMEOUT" : "HTTP_INTERNAL_SERVER_ERROR",
      category: "http_provider",
      apiVersion,
      httpStatus: status,
      message: redactSensitiveString(providerMessage || `Dailymotion upstream server error (HTTP ${status}).`),
      userMessage: "Dailymotion is temporarily experiencing technical issues. Please try again later.",
      suggestedAction: "Wait a moment and retry. If errors persist, verify Dailymotion platform status.",
      retryable: isRetryable,
      requestId: correlationId,
      timestamp,
      endpoint,
      resourceType,
      safeProviderDetails: redactSensitiveData(rawObj),
    };
  }

  // Fallback default
  return {
    code: "APP_INTERNAL_ERROR",
    category: "integration",
    apiVersion,
    httpStatus: status ?? null,
    message: redactSensitiveString(providerMessage || (input.error instanceof Error ? input.error.message : "Unexpected Dailymotion API failure.")),
    userMessage: "An unexpected error occurred while communicating with Dailymotion.",
    suggestedAction: "Review your parameters and retry the operation.",
    retryable: false,
    requestId: correlationId,
    timestamp,
    endpoint,
    resourceType,
    safeProviderDetails: redactSensitiveData(rawObj),
  };
}
