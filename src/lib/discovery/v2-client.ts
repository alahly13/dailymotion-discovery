// DailymotionV2Client — API v2 (https://api.dailymotion.com/v2).
//
// What this controls: all HTTP traffic for the v2 discovery workspaces.
// Why it exists: v2 differs from v1 in envelope (`{data,pagination}`),
// pagination (`page`/`page_size` + opaque `next`), error shape, auth model
// (Bearer ALWAYS required — anonymous v2 reads return 401), and field
// dialect (sparse `fields`, ISO-8601 dates). Never pointed at the v1 host.
// Missing credentials are reported as `auth_missing` WITHOUT an HTTP call.
// Scope: server-only (route handlers / services).

import { getV2Profile } from "./version-config";
import { getVersionTokenResult, invalidateVersionToken } from "./auth";
import type { DiscoveryFailureReason } from "./types";

export interface V2Pagination {
  page?: number;
  page_size?: number;
  total?: number | null;
  next?: string | null;
  previous?: string | null;
}

export interface V2Collection<T> {
  data?: T[];
  pagination?: V2Pagination;
}

export interface V2ErrorEnvelope {
  error?: { code?: string; message?: string; correlation_id?: string | null; details?: unknown };
}

export interface V2ClientError {
  error: string;
  reason: DiscoveryFailureReason;
  status: number;
  retryable: boolean;
  code: string | null;
}

function withTimeout(ms = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyV2(status: number, code: string | null): { reason: DiscoveryFailureReason; retryable: boolean } {
  if (status === 401)
    return {
      reason: code === "AUTHORIZATION_EXPIRED" ? "auth_expired" : "auth_missing",
      retryable: false,
    };
  if (status === 403) return { reason: "forbidden", retryable: false };
  if (status === 404) return { reason: "not_found", retryable: false };
  if (status === 422) return { reason: "user_input_error", retryable: false };
  if (status === 429) return { reason: "rate_limited", retryable: true };
  if (status >= 500) return { reason: "upstream_error", retryable: true };
  return { reason: "upstream_error", retryable: false };
}

export interface V2RequestOptions {
  timeoutMs?: number;
  retries?: number;
}

async function v2FetchRaw(path: string, params: Record<string, string>, options: V2RequestOptions, attempt: number, refreshed = false) {
  const profile = getV2Profile();
  const tokenResult = await getVersionTokenResult("v2");
  if (!tokenResult.ok) {
    return {
      noAuth: true as const,
      failure: {
        error: tokenResult.value.error,
        reason: (tokenResult.value.reason === "missing_credentials" ? "auth_missing" : "auth_expired") as DiscoveryFailureReason,
        status: tokenResult.value.status,
        retryable: false,
        code: tokenResult.value.reason.toUpperCase(),
      } satisfies V2ClientError,
    };
  }
  const token = tokenResult.value.token;
  const url = new URL(`${profile.baseUrl}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "") url.searchParams.set(key, value);
  }
  const scope = withTimeout(options.timeoutMs ?? 12_000);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: scope.signal,
      cache: "no-store",
    });
    const status = response.status;
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if ((status === 429 || status >= 500) && attempt < (options.retries ?? 2)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 5000));
      return v2FetchRaw(path, params, options, attempt + 1, refreshed);
    }
    // Genuine 401 (v2 always attaches a token): invalidate, reacquire once,
    // retry once. 403 stays permission. No loops.
    if (status === 401 && !refreshed) {
      invalidateVersionToken("v2");
      return v2FetchRaw(path, params, options, attempt, true);
    }
    return { noAuth: false as const, status, json };
  } catch (error) {
    if (attempt < (options.retries ?? 2)) {
      await sleep(Math.min(1000 * 2 ** attempt, 5000));
      return v2FetchRaw(path, params, options, attempt + 1);
    }
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new Error(aborted ? "Dailymotion v2 request timed out." : "Dailymotion v2 network error.");
  } finally {
    scope.clear();
  }
}

function toFailure(status: number, json: unknown): V2ClientError {
  const envelope = (json ?? {}) as V2ErrorEnvelope;
  const code = envelope.error?.code ?? null;
  const classified = classifyV2(status, code);
  return {
    error: envelope.error?.message ?? `Dailymotion v2 request failed (${status}).`,
    status,
    retryable: classified.retryable,
    reason: classified.reason,
    code,
  };
}

export async function v2List<T>(
  path: string,
  params: Record<string, string>,
  options: V2RequestOptions = {}
): Promise<{ ok: true; data: V2Collection<T>; status: number } | { ok: false; failure: V2ClientError }> {
  try {
    const raw = await v2FetchRaw(path, params, options, 0);
    if (raw.noAuth) return { ok: false, failure: raw.failure };
    if (raw.status === 200 || raw.status === 206) return { ok: true, data: (raw.json ?? {}) as V2Collection<T>, status: raw.status };
    return { ok: false, failure: toFailure(raw.status, raw.json) };
  } catch (error) {
    return {
      ok: false,
      failure: {
        error: error instanceof Error ? error.message : "Dailymotion v2 network error.",
        reason: "network_error",
        status: 503,
        retryable: true,
        code: null,
      },
    };
  }
}

export async function v2Get<T>(
  path: string,
  params: Record<string, string> = {},
  options: V2RequestOptions = {}
): Promise<{ ok: true; data: T; status: number } | { ok: false; failure: V2ClientError }> {
  try {
    const raw = await v2FetchRaw(path, params, options, 0);
    if (raw.noAuth) return { ok: false, failure: raw.failure };
    if (raw.status >= 200 && raw.status < 300) return { ok: true, data: raw.json as T, status: raw.status };
    return { ok: false, failure: toFailure(raw.status, raw.json) };
  } catch (error) {
    return {
      ok: false,
      failure: {
        error: error instanceof Error ? error.message : "Dailymotion v2 network error.",
        reason: "network_error",
        status: 503,
        retryable: true,
        code: null,
      },
    };
  }
}
