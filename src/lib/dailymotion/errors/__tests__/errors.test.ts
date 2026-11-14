import { describe, expect, it } from "vitest";
import {
  redactSensitiveData,
  redactSensitiveString,
} from "../redact";
import {
  calculateBackoffMs,
  parseRetryAfterHeader,
} from "../retry";
import {
  normalizeDailymotionError,
} from "../normalizer";

describe("Dailymotion Error Redaction", () => {
  it("redacts Bearer tokens from error strings", () => {
    const raw = "Request failed with Authorization: Bearer dma_secret_token_123456789";
    const redacted = redactSensitiveString(raw);
    expect(redacted).not.toContain("dma_secret_token_123456789");
    expect(redacted).toContain("Bearer [REDACTED]");
  });

  it("redacts query parameter secrets from URLs", () => {
    const url = "https://partner.api.dailymotion.com/oauth/v1/token?client_secret=super_secret_xyz&client_id=my_key";
    const redacted = redactSensitiveString(url);
    expect(redacted).not.toContain("super_secret_xyz");
    expect(redacted).toContain("client_secret=[REDACTED]");
    expect(redacted).toContain("client_id=my_key");
  });

  it("recursively redacts sensitive keys from objects and arrays", () => {
    const payload = {
      user: "test_user",
      client_secret: "raw_secret_value",
      nested: {
        access_token: "token_abc_123",
        items: [
          { apiKeySecret: "nested_secret", name: "safe_item" }
        ]
      }
    };
    const cleaned = redactSensitiveData(payload);
    expect(cleaned.client_secret).toBe("[REDACTED]");
    expect(cleaned.nested.access_token).toBe("[REDACTED]");
    expect(cleaned.nested.items[0].apiKeySecret).toBe("[REDACTED]");
    expect(cleaned.nested.items[0].name).toBe("safe_item");
  });
});

describe("Dailymotion Error Retry & Backoff", () => {
  it("calculates exponential backoff within configured bounds", () => {
    const delay0 = calculateBackoffMs(0, 500, 10000);
    const delay1 = calculateBackoffMs(1, 500, 10000);
    const delay2 = calculateBackoffMs(2, 500, 10000);

    expect(delay0).toBe(500);
    expect(delay1).toBeGreaterThanOrEqual(500);
    expect(delay1).toBeLessThanOrEqual(1000);
    expect(delay2).toBeGreaterThanOrEqual(500);
    expect(delay2).toBeLessThanOrEqual(2000);
  });

  it("clamps backoff to maxDelayMs", () => {
    const delay10 = calculateBackoffMs(10, 500, 5000);
    expect(delay10).toBeLessThanOrEqual(5000);
  });

  it("parses numeric Retry-After headers in seconds", () => {
    expect(parseRetryAfterHeader("5")).toBe(5000);
    expect(parseRetryAfterHeader("12")).toBe(12000);
    expect(parseRetryAfterHeader(null)).toBeNull();
    expect(parseRetryAfterHeader("invalid")).toBeNull();
  });
});

describe("Dailymotion Error Normalizer", () => {
  it("normalizes HTTP 400 invalid_scope into AUTH_INVALID_SCOPE with actionable guidance", () => {
    const err = normalizeDailymotionError({
      status: 400,
      apiVersion: "v2",
      rawJson: {
        error: {
          code: 400,
          message: "Requested scope bundle.public is not allowed for the client"
        }
      }
    });

    expect(err.code).toBe("AUTH_INVALID_SCOPE");
    expect(err.category).toBe("auth");
    expect(err.httpStatus).toBe(400);
    expect(err.apiVersion).toBe("v2");
    expect(err.suggestedAction).toContain("read scopes");
  });

  it("normalizes HTTP 401 invalid_token into AUTH_EXPIRED_TOKEN when expired", () => {
    const err = normalizeDailymotionError({
      status: 401,
      apiVersion: "v1",
      rawJson: {
        error: { code: 401, message: "Token expired or authorization invalid" }
      }
    });

    expect(err.code).toBe("AUTH_EXPIRED_TOKEN");
    expect(err.category).toBe("auth");
    expect(err.httpStatus).toBe(401);
  });

  it("normalizes HTTP 404 into HTTP_NOT_FOUND", () => {
    const err = normalizeDailymotionError({
      status: 404,
      apiVersion: "v2",
      rawJson: { error: { message: "Resource not found" } },
      endpoint: "https://api.dailymotion.com/v2/videos/nonexistent"
    });

    expect(err.code).toBe("HTTP_NOT_FOUND");
    expect(err.category).toBe("http_provider");
    expect(err.httpStatus).toBe(404);
  });

  it("normalizes HTTP 429 into HTTP_TOO_MANY_REQUESTS", () => {
    const err = normalizeDailymotionError({
      status: 429,
      apiVersion: "v2",
      rawJson: { error: { message: "Rate limit reached" } }
    });

    expect(err.code).toBe("HTTP_TOO_MANY_REQUESTS");
    expect(err.category).toBe("http_provider");
    expect(err.retryable).toBe(true);
    expect(err.httpStatus).toBe(429);
  });

  it("normalizes network timeouts into NETWORK_TIMEOUT", () => {
    const networkError = new Error("Connection timed out after 10000ms");

    const err = normalizeDailymotionError({
      error: networkError,
      apiVersion: "v1",
      endpoint: "https://api.dailymotion.com/videos"
    });
    expect(err.code).toBe("NETWORK_TIMEOUT");
    expect(err.category).toBe("network");
    expect(err.retryable).toBe(true);
  });
});
