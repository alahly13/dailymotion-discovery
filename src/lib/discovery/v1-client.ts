// DailymotionV1Client — Legacy/Partner API v1.
//
// What this controls: all HTTP traffic for the v1 discovery workspaces.
// Why it exists: v1 has its own envelope (`{page,limit,total,has_more,list}`),
// its own param dialect (`limit`/`page`/`search`/unix timestamps), and two
// hosts with different auth rules (live-verified):
// - Partner host (profile.baseUrl): token REQUIRED (anonymous → 401).
// - Public host (profile.publicBaseUrl, DAILYMOTION_API_BASE_URL_V1):
//   anonymous public discovery. Partner and public hosts are never treated
//   as interchangeable beyond the documented explicit alias rule.
// Host selection is version-local: token available → partner; otherwise →
// public host. V1 NEVER uses the v2 base URL or v2 tokens.
// Resilience rule: public reads stay available even when optional v1 creds
// are missing/invalid (fallback is same-version public host, never v2).
// Set `authenticated: true` for gated ops to fail closed instead.
// Scope: server-only (route handlers / services).

import { getV1Profile } from "./version-config";
import { getVersionTokenResult, invalidateVersionToken } from "./auth";
import type { DiscoveryFailureReason } from "./types";

export interface V1ListEnvelope<T> {
  page?: number;
  limit?: number;
  total?: number;
  has_more?: boolean;
  list?: T[];
  error?: { code?: number | string; message?: string; type?: string };
}

export interface V1ClientError {
  error: string;
  reason: DiscoveryFailureReason;
  status: number;
  retryable: boolean;
}

const TRANSIENT_REASONS: DiscoveryFailureReason[] = ["rate_limited", "network_error", "upstream_error"];

function withTimeout(ms = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function classifyStatus(status: number, hasKey: boolean): Omit<V1ClientError, "error"> {
  if (status === 429) return { reason: "rate_limited", status, retryable: true };
  if (status === 401) return { reason: "auth_expired", status, retryable: false };
  if (status === 403)
    return {
      reason: hasKey ? "forbidden" : "auth_missing",
      status,
      retryable: false,
    };
  if (status === 404) return { reason: "not_found", status, retryable: false };
  if (status >= 500) return { reason: "upstream_error", status, retryable: true };
  return { reason: "upstream_error", status, retryable: false };
}

export function isRetryableReason(reason: DiscoveryFailureReason): boolean {
  return TRANSIENT_REASONS.includes(reason);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface V1RequestOptions {
  /** Fail closed when no valid token (for auth-gated ops). Default: resilient public fallback. */
  authenticated?: boolean;
  timeoutMs?: number;
  retries?: number;
}

interface ResolvedEndpoint {
  baseUrl: string;
  token: string | null;
}

async function resolveEndpoint(authenticated: boolean): Promise<ResolvedEndpoint | { failure: V1ClientError }> {
  const profile = getV1Profile();
  const tokenResult = await getVersionTokenResult("v1");
  if (tokenResult.ok) {
    return { baseUrl: profile.baseUrl, token: tokenResult.value.token };
  }
  if (authenticated || profile.anonymousBaseUrl === null) {
    const reason: DiscoveryFailureReason =
      tokenResult.value.reason === "missing_credentials" ? "auth_missing" : "auth_expired";
    return {
      failure: {
        error: tokenResult.value.error,
        reason,
        status: tokenResult.value.status,
        retryable: false,
      },
    };
  }
  // Same-version public fallback (never v2): anonymous discovery stays up.
  return { baseUrl: profile.anonymousBaseUrl ?? profile.publicBaseUrl, token: null };
}

async function v1FetchRaw(
  path: string,
  params: Record<string, string>,
  options: V1RequestOptions = {},
  attempt = 0,
  refreshed = false
): Promise<{ status: number; json: unknown } | { failure: V1ClientError }> {
  const resolved = await resolveEndpoint(options.authenticated === true);
  if ("failure" in resolved) return resolved;
  const url = new URL(`${resolved.baseUrl}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "") url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (resolved.token) headers.Authorization = `Bearer ${resolved.token}`;
  const scope = withTimeout(options.timeoutMs ?? 12_000);
  try {
    const response = await fetch(url.toString(), { headers, signal: scope.signal, cache: "no-store" });
    const status = response.status;
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if ((status === 429 || status >= 500) && attempt < (options.retries ?? 2)) {
      const backoff = Math.min(1000 * 2 ** attempt, 5000);
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff);
      return v1FetchRaw(path, params, options, attempt + 1, refreshed);
    }
    // Genuine 401 with an attached token: invalidate that version's cache,
    // reacquire exactly once, and retry once. 403 is permission (never a
    // token retry); anonymous 401 has no token to refresh. No loops.
    if (status === 401 && resolved.token && !refreshed) {
      invalidateVersionToken("v1");
      return v1FetchRaw(path, params, options, attempt, true);
    }
    return { status, json };
  } catch (error) {
    if (attempt < (options.retries ?? 2)) {
      await sleep(Math.min(1000 * 2 ** attempt, 5000));
      return v1FetchRaw(path, params, options, attempt + 1, refreshed);
    }
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new Error(aborted ? "Dailymotion v1 request timed out." : "Dailymotion v1 network error.");
  } finally {
    scope.clear();
  }
}

export async function v1List<T>(
  path: string,
  params: Record<string, string>,
  options: V1RequestOptions = {}
): Promise<{ ok: true; data: V1ListEnvelope<T>; status: number } | { ok: false; failure: V1ClientError }> {
  const profile = getV1Profile();
  try {
    const raw = await v1FetchRaw(path, params, options);
    if ("failure" in raw) return { ok: false, failure: raw.failure };
    const { status, json } = raw;
    const envelope = (json ?? {}) as V1ListEnvelope<T>;
    if (envelope.error?.message) {
      const classified = classifyStatus(typeof envelope.error.code === "number" ? envelope.error.code : status, profile.hasCredentials);
      return {
        ok: false,
        failure: { error: envelope.error.message, status, retryable: classified.retryable, reason: classified.reason },
      };
    }
    if (status === 401 || status === 403 || status === 429 || status >= 500) {
      const classified = classifyStatus(status, profile.hasCredentials);
      const hint =
        classified.reason === "auth_missing"
          ? " Anonymous v1 access is blocked for this filter. Configure v1 credentials or use the documented alternative."
          : "";
      return {
        ok: false,
        failure: {
          error: `Dailymotion v1 request failed (${status}).${hint}`,
          status,
          retryable: classified.retryable,
          reason: classified.reason,
        },
      };
    }
    if (status === 404 || !json) {
      return { ok: false, failure: { error: "Resource not found.", reason: "not_found", status: 404, retryable: false } };
    }
    return { ok: true, data: envelope, status };
  } catch (error) {
    return {
      ok: false,
      failure: {
        error: error instanceof Error ? error.message : "Dailymotion v1 network error.",
        reason: "network_error",
        status: 503,
        retryable: true,
      },
    };
  }
}

export async function v1Get<T>(
  path: string,
  params: Record<string, string> = {},
  options: V1RequestOptions = {}
): Promise<{ ok: true; data: T; status: number } | { ok: false; failure: V1ClientError }> {
  const profile = getV1Profile();
  try {
    const raw = await v1FetchRaw(path, params, options);
    if ("failure" in raw) return { ok: false, failure: raw.failure };
    const { status, json } = raw;
    const record = (json ?? {}) as Record<string, unknown> & { error?: { message?: string; code?: number | string } };
    if (record.error?.message) {
      const code = typeof record.error.code === "number" ? record.error.code : status;
      const classified = classifyStatus(code, profile.hasCredentials);
      return { ok: false, failure: { error: record.error.message, status: code, retryable: classified.retryable, reason: classified.reason } };
    }
    if (!(status >= 200 && status < 300)) {
      const classified = classifyStatus(status, profile.hasCredentials);
      return {
        ok: false,
        failure: { error: status === 404 ? "Resource not found." : `Dailymotion v1 request failed (${status}).`, ...classified, retryable: classified.retryable },
      };
    }
    return { ok: true, data: json as T, status };
  } catch (error) {
    return {
      ok: false,
      failure: {
        error: error instanceof Error ? error.message : "Dailymotion v1 network error.",
        reason: "network_error",
        status: 503,
        retryable: true,
      },
    };
  }
}
