// Per-version connection tests: token acquisition + read-only API probe.
//
// What this controls: the `Authenticate & Test V1/V2` evidence. A token alone
// is never enough — each test performs a harmless read-only call with
// `Authorization: Bearer` and interprets the outcome separately:
// missing env, unreachable token endpoint, invalid client, invalid scope,
// token-ok-but-API-failed, insufficient permissions, or full success.
// Sanitized: responses contain booleans, names, timings, and expiry — never
// keys, secrets, or token strings. Nothing is logged with sensitive values.
// Server-side cooldown (8s per version) prevents duplicate-click stampedes.
// Scope: connection test API routes. Future agents: keep probes read-only and
// within the default scopes (v1 userinfo-compatible listing, v2 video.read).

import { getVersionProfile } from "./version-config";
import { credentialHint, getVersionTokenResult } from "./auth";
import type { ApiVersion } from "./types";

export interface ConnectionStep {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  version: ApiVersion;
  testedAt: string;
  steps: ConnectionStep[];
  token: { acquired: boolean; expiresIn: number | null; scope: string | null; fromCache: boolean };
  api: { endpoint: string; status: number | null; outcome: string } | null;
  remedy: string | null;
}

const lastRunAt: Record<ApiVersion, number> = { v1: 0, v2: 0 };
const COOLDOWN_MS = 8000;

/** Test seam: reset the duplicate-click cooldown. */
export function resetConnectionTestCooldown(): void {
  lastRunAt.v1 = 0;
  lastRunAt.v2 = 0;
}

function cooldownRemaining(version: ApiVersion): number {
  return Math.max(0, COOLDOWN_MS - (Date.now() - lastRunAt[version]));
}

async function probe(url: string, token: string, timeoutMs = 12_000): Promise<{ status: number; ms: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    // Drain the body so sockets reuse cleanly; content is not interpreted here.
    try {
      await response.text();
    } catch {
      /* ignore body errors */
    }
    return { status: response.status, ms: Date.now() - started };
  } catch {
    return { status: 0, ms: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

/** Stable public video id observed live on v1; used only as a v2 visibility probe. */
const V2_PROBE_VIDEO_ID = "x5auisp";

export async function testVersionConnection(version: ApiVersion): Promise<ConnectionTestResult> {
  const profile = getVersionProfile(version);
  const testedAt = new Date().toISOString();
  const steps: ConnectionStep[] = [];
  const remaining = cooldownRemaining(version);
  if (remaining > 0) {
    return {
      ok: false, version, testedAt, steps: [],
      token: { acquired: false, expiresIn: null, scope: null, fromCache: false },
      api: null,
      remedy: `A test ran seconds ago — wait ${Math.ceil(remaining / 1000)}s to avoid duplicate authentication requests.`,
    };
  }
  lastRunAt[version] = Date.now();

  if (!profile.hasCredentials) {
    return {
      ok: false, version, testedAt,
      steps: [{ name: "configuration", ok: false, detail: `Missing ${version.toUpperCase()} credentials.`, latencyMs: 0 }],
      token: { acquired: false, expiresIn: null, scope: profile.scope, fromCache: false },
      api: null,
      remedy: credentialHint(version),
    };
  }
  steps.push({ name: "configuration", ok: true, detail: `Credentials present; scope ${profile.scope}.`, latencyMs: 0 });

  // Force-refresh proves acquisition instead of trusting a stale cache entry.
  const tokenStarted = Date.now();
  const tokenResult = await getVersionTokenResult(version, { forceRefresh: true });
  const tokenMs = Date.now() - tokenStarted;
  if (!tokenResult.ok) {
    steps.push({ name: "token acquisition", ok: false, detail: tokenResult.value.error, latencyMs: tokenMs });
    return {
      ok: false, version, testedAt, steps,
      token: { acquired: false, expiresIn: null, scope: profile.scope, fromCache: false },
      api: null,
      remedy: tokenResult.value.remedy,
    };
  }
  steps.push({
    name: "token acquisition",
    ok: true,
    detail: `Token acquired via client_credentials (expires in ${tokenResult.value.expiresIn}s, scope ${tokenResult.value.scope}).`,
    latencyMs: tokenMs,
  });
  const tokenInfo = { acquired: true, expiresIn: tokenResult.value.expiresIn, scope: tokenResult.value.scope, fromCache: false };

  if (version === "v1") {
    // Documented legacy list endpoint, minimal page, sparse fields.
    const endpoint = "GET /videos?limit=1";
    const { status, ms } = await probe(
      `${profile.baseUrl}/videos?${new URLSearchParams({ limit: "1", fields: "id,title" }).toString()}`,
      tokenResult.value.token
    );
    if (status === 200) {
      steps.push({ name: "api connectivity", ok: true, detail: "Partner list endpoint answered with the v1 token.", latencyMs: ms });
      return { ok: true, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "success" }, remedy: null };
    }
    if (status === 401) {
      steps.push({ name: "api connectivity", ok: false, detail: "Partner API rejected the fresh token (401).", latencyMs: ms });
      return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "token-rejected" }, remedy: "The key may be revoked or scoped away from this host. Recreate/check it in Dailymotion Studio." };
    }
    if (status === 403) {
      steps.push({ name: "api connectivity", ok: false, detail: "Authenticated but insufficient permissions (403).", latencyMs: ms });
      return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "forbidden" }, remedy: "Token works; the key lacks permission for this call. Broaden the key's profile permissions or use a permitted endpoint." };
    }
    if (status === 0) {
      steps.push({ name: "api connectivity", ok: false, detail: "Partner API unreachable (network/timeout).", latencyMs: ms });
      return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status: null, outcome: "unreachable" }, remedy: `Check network access to ${profile.baseUrl} and retry.` };
    }
    steps.push({ name: "api connectivity", ok: false, detail: `Partner API returned HTTP ${status}.`, latencyMs: ms });
    return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "token-ok-api-failed" }, remedy: "Token acquisition succeeded but the API call failed — inspect the status and retry." };
  }

  // v2: direct video lookup needs only video.read (inside bundle.public).
  // 200 = full success. 404 still proves the token was ACCEPTED (else 401):
  // the probe video is simply not visible to this key.
  const endpoint = "GET /videos/{id}";
  const { status, ms } = await probe(
    `${profile.baseUrl}/videos/${V2_PROBE_VIDEO_ID}?${new URLSearchParams({ fields: "video_id,title" }).toString()}`,
    tokenResult.value.token
  );
  if (status === 200) {
    steps.push({ name: "api connectivity", ok: true, detail: "v2 video lookup answered with the v2 token.", latencyMs: ms });
    return { ok: true, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "success" }, remedy: null };
  }
  if (status === 401) {
    steps.push({ name: "api connectivity", ok: false, detail: "v2 rejected the fresh token (401).", latencyMs: ms });
    return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "token-rejected" }, remedy: "Verify the private API key/secret and its profile permissions in Dailymotion Studio." };
  }
  if (status === 403) {
    steps.push({ name: "api connectivity", ok: false, detail: "Authenticated but missing permission (403 MISSING_PERMISSIONS).", latencyMs: ms });
    return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "forbidden" }, remedy: "Grant video.read (bundle.public covers it) to the private API key." };
  }
  if (status === 404) {
    steps.push({ name: "api connectivity", ok: true, detail: "Token accepted (not a 401); probe video not visible to this key (404).", latencyMs: ms });
    return { ok: true, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "authenticated-not-visible" }, remedy: null };
  }
  if (status === 0) {
    steps.push({ name: "api connectivity", ok: false, detail: "v2 API unreachable (network/timeout).", latencyMs: ms });
    return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status: null, outcome: "unreachable" }, remedy: `Check network access to ${profile.baseUrl} and retry.` };
  }
  steps.push({ name: "api connectivity", ok: false, detail: `v2 API returned HTTP ${status}.`, latencyMs: ms });
  return { ok: false, version, testedAt, steps, token: tokenInfo, api: { endpoint, status, outcome: "token-ok-api-failed" }, remedy: "Token acquisition succeeded but the API call failed — inspect the status and retry." };
}
