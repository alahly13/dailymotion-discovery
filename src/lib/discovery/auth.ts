// Server-side OAuth token management — one isolated namespace per version.
//
// What this controls: client_credentials acquisition, caching, expiry, and
// sanitized status for the V1 and V2 integrations independently.
// Why it exists: the two token endpoints, request/response shapes, scopes,
// and lifetimes differ. A shared helper is parameterized by a strictly typed
// `VersionProfile`; caches, scopes, and interpretation are never shared:
// V1 tokens never reach V2 and vice versa.
// Behavior:
// - Reuse valid tokens (60s safety margin before expiry); honor the server's
//   `expires_in`, with per-version documented fallbacks (v1 ~10h, v2 30min).
// - Force-refresh is available for connection tests (proves acquisition).
// - Failures distinguish: missing creds, unreachable endpoint, invalid
//   client (401), invalid/unsupported scope (400/422), malformed payload.
// - Tokens/secrets are never logged and never leave the server.
// Scope: server-only.

import { getVersionProfile, tokenSafetyMarginSeconds, type VersionProfile } from "./version-config";
import { clearDurableToken, readDurableToken, writeDurableToken } from "./token-cache-store";
import type { ApiVersion } from "./types";

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
  scope: string;
  obtainedAt: number;
}

const cache: Record<ApiVersion, TokenCacheEntry | null> = { v1: null, v2: null };
// Single-flight: concurrent callers share one acquisition (no stampede).
const inflight: Record<ApiVersion, Promise<{ ok: true; value: TokenSuccess } | { ok: false; value: TokenFailure }> | null> = { v1: null, v2: null };

export type TokenFailureReason =
  | "missing_credentials"
  | "token_unreachable"
  | "invalid_client"
  | "invalid_scope"
  | "malformed_token_response"
  | "token_rejected";

export interface TokenFailure {
  reason: TokenFailureReason;
  error: string;
  status: number;
  /** Actionable, sanitized remedy (names only, never values). */
  remedy: string;
}

export interface TokenSuccess {
  token: string;
  expiresIn: number;
  scope: string;
  fromCache: boolean;
}

function missingRemedy(version: ApiVersion): string {
  return version === "v1"
    ? "Set PRIVATE_DAILYMOTION_API_KEY_V1 and PRIVATE_DAILYMOTION_API_KEY_SECRET_V1."
    : "Set PRIVATE_DAILYMOTION_API_KEY_V2 and PRIVATE_DAILYMOTION_API_KEY_SECRET_V2.";
}

export function credentialHint(version: ApiVersion): string {
  const scopeHint =
    version === "v1"
      ? " DAILYMOTION_API_SCOPE_V1 defaults to userinfo (least privilege)."
      : " DAILYMOTION_API_SCOPE_V2 defaults to bundle.public.";
  return `${missingRemedy(version)}${scopeHint} Dailymotion Studio → Organization → API keys.`;
}

function getValidCached(profile: VersionProfile): TokenCacheEntry | null {
  const entry = cache[profile.version];
  if (!entry) return null;
  if (entry.scope !== profile.scope) return null; // scope change invalidates
  if (Date.now() > entry.expiresAt - tokenSafetyMarginSeconds() * 1000) return null;
  return entry;
}

function remember(profile: VersionProfile, token: string, expiresIn: number, scope: string): TokenSuccess {
  const now = Date.now();
  cache[profile.version] = { token, expiresAt: now + expiresIn * 1000, scope, obtainedAt: now };
  // Durable write is acquisition-only (never per search) and best-effort.
  void writeDurableToken(profile.version, { token, expiresAt: now + expiresIn * 1000, scope, obtainedAt: now });
  return { token, expiresIn, scope, fromCache: false };
}

async function hydrateFromDurable(profile: VersionProfile): Promise<TokenCacheEntry | null> {
  const margin = tokenSafetyMarginSeconds() * 1000;
  const mem = cache[profile.version];
  // Memory entries must re-validate scope AND margin (scope rotation or
  // margin change invalidates even unexpired entries).
  if (mem && mem.scope === profile.scope && Date.now() <= mem.expiresAt - margin) return mem;
  if (mem) cache[profile.version] = null;
  const durable = await readDurableToken(profile.version);
  if (!durable) return null;
  if (durable.scope !== profile.scope) return null;
  if (Date.now() > durable.expiresAt - margin) return null;
  cache[profile.version] = { token: durable.token, expiresAt: durable.expiresAt, scope: durable.scope, obtainedAt: durable.obtainedAt };
  return cache[profile.version];
}

function classifyTokenError(status: number, bodyText: string, version: ApiVersion): TokenFailure {
  const lowered = bodyText.toLowerCase();
  if (status === 400 && /scope/.test(lowered)) {
    return {
      reason: "invalid_scope",
      error: `Token endpoint rejected the ${version.toUpperCase()} scope.`,
      status,
      remedy:
        version === "v1"
          ? "Use a documented v1 Platform scope (userinfo, manage_videos, manage_players, manage_playlists, manage_subtitles, email). See DAILYMOTION_API_SCOPE_V1."
          : "Use a documented v2 scope or bundle (bundle.public for read-only discovery). See DAILYMOTION_API_SCOPE_V2.",
    };
  }
  if (status === 422 && /scope/.test(lowered)) {
    return {
      reason: "invalid_scope",
      error: `Token endpoint requires a valid ${version.toUpperCase()} scope.`,
      status,
      remedy: version === "v1" ? "Set DAILYMOTION_API_SCOPE_V1 to a documented v1 scope." : "Set DAILYMOTION_API_SCOPE_V2 (default bundle.public).",
    };
  }
  if (status === 401 || /invalid_client|invalid_grant|unauthorized/i.test(bodyText)) {
    return {
      reason: "invalid_client",
      error: `Token endpoint rejected the ${version.toUpperCase()} client credentials.`,
      status: 401,
      remedy: `Verify the ${version.toUpperCase()} API key and secret in Dailymotion Studio; the secret is shown once at creation. ${missingRemedy(version)}`,
    };
  }
  return {
    reason: "token_rejected",
    error: `Token endpoint returned HTTP ${status} for ${version.toUpperCase()}.`,
    status,
    remedy: "Retry shortly; if it persists, verify the token endpoint URL and key permissions.",
  };
}

/** Core helper: identical flow, strictly version-parameterized. No cross-version state. */
async function acquireToken(profile: VersionProfile): Promise<{ ok: true; value: TokenSuccess } | { ok: false; value: TokenFailure }> {
  const { version } = profile;
  if (!profile.hasCredentials) {
    return { ok: false, value: { reason: "missing_credentials", error: `Missing ${version.toUpperCase()} credentials.`, status: 401, remedy: missingRemedy(version) } };
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: profile.key,
    client_secret: profile.secret,
    scope: profile.scope,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(profile.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    return { ok: false, value: { reason: "token_unreachable", error: `Token endpoint unreachable for ${version.toUpperCase()}.`, status: 503, remedy: `Check network access to ${profile.tokenUrl} and retry.` } };
  } finally {
    clearTimeout(timeout);
  }
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }
  if (!response.ok) {
    return { ok: false, value: classifyTokenError(response.status, bodyText, version) };
  }
  let data: { access_token?: unknown; expires_in?: unknown; scope?: unknown };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    return { ok: false, value: { reason: "malformed_token_response", error: `Token endpoint returned invalid JSON for ${version.toUpperCase()}.`, status: 502, remedy: "Retry shortly; the endpoint may be degraded." } };
  }
  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    return { ok: false, value: { reason: "malformed_token_response", error: `Token response missed access_token for ${version.toUpperCase()}.`, status: 502, remedy: "Retry shortly; the endpoint may be degraded." } };
  }
  const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : version === "v2" ? 1800 : 36000;
  const scope = typeof data.scope === "string" && data.scope ? data.scope : profile.scope;
  return { ok: true, value: remember(profile, data.access_token, expiresIn, scope) };
}

/** Bearer token for `version` (cached reuse) or a classified failure. */
export async function getVersionTokenResult(
  version: ApiVersion,
  options: { forceRefresh?: boolean } = {}
): Promise<{ ok: true; value: TokenSuccess } | { ok: false; value: TokenFailure }> {
  const profile = getVersionProfile(version);
  if (!options.forceRefresh) {
    const cached = getValidCached(profile) ?? (await hydrateFromDurable(profile));
    if (cached && Date.now() <= cached.expiresAt - tokenSafetyMarginSeconds() * 1000) {
      return {
        ok: true,
        value: { token: cached.token, expiresIn: Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000)), scope: cached.scope, fromCache: true },
      };
    }
  }
  // Single-flight: one acquisition per version at a time.
  if (!inflight[version]) {
    inflight[version] = acquireToken(profile).finally(() => {
      inflight[version] = null;
    });
  }
  return inflight[version]!;
}

/** String-only convenience (null on any failure). Keeps old call sites working. */
export async function getVersionToken(version: ApiVersion): Promise<string | null> {
  const result = await getVersionTokenResult(version);
  return result.ok ? result.value.token : null;
}

/** Test seam: clear cached tokens (one version or both, memory + durable). */
export function clearVersionTokenCache(version?: ApiVersion): void {
  if (version) {
    cache[version] = null;
    void clearDurableToken(version);
  } else {
    cache.v1 = null;
    cache.v2 = null;
    void clearDurableToken("v1");
    void clearDurableToken("v2");
  }
}

/**
 * Invalidate one version's token after a genuine 401 (invalid/expired).
 * Callers may then reacquire exactly once — never loop.
 */
export function invalidateVersionToken(version: ApiVersion): void {
  cache[version] = null;
  void clearDurableToken(version);
}

/** Async status that hydrates from the durable tier first (cross-instance). */
export async function getTokenStatusAsync(version: ApiVersion): Promise<ReturnType<typeof getTokenStatus>> {
  const profile = getVersionProfile(version);
  if (profile.hasCredentials) await hydrateFromDurable(profile);
  return getTokenStatus(version);
}
export function getTokenStatus(version: ApiVersion): {
  configured: boolean;
  scope: string;
  cached: boolean;
  expiresIn: number | null;
  expiresAt: number | null;
  lastAuthAt: number | null;
} {
  const profile = getVersionProfile(version);
  const entry = profile.hasCredentials ? getValidCached(profile) : null;
  return {
    configured: profile.hasCredentials,
    scope: profile.scope,
    cached: entry !== null,
    expiresIn: entry ? Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000)) : null,
    expiresAt: entry ? entry.expiresAt : null,
    lastAuthAt: entry ? entry.obtainedAt : null,
  };
}
