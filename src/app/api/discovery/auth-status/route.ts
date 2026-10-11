// GET /api/discovery/auth-status — sanitized profile facts only.
// Booleans, URLs, scope names, expiry timestamps, and non-sensitive defaults.
// Private keys, secrets, and tokens are never serialized. Reading status
// never acquires or renews tokens (async hydration only reuses valid cache).

import { NextResponse } from "next/server";
import { defaultLocalization, getV1Profile, getV2Profile, parseFamilyFilterEnv } from "@/lib/discovery/version-config";
import { credentialHint, getTokenStatusAsync } from "@/lib/discovery/auth";
import { durableCacheStatus } from "@/lib/discovery/token-cache-store";
import { storageConfigStatus } from "@/lib/supabase/storage-server";

export async function GET() {
  const v1 = getV1Profile();
  const v2 = getV2Profile();
  const [v1Token, v2Token] = await Promise.all([getTokenStatusAsync("v1"), getTokenStatusAsync("v2")]);
  const familyFilter = parseFamilyFilterEnv();
  return NextResponse.json({
    ok: true,
    v1: {
      baseUrl: v1.baseUrl,
      publicBaseUrl: v1.publicBaseUrl,
      tokenUrl: v1.tokenUrl,
      scope: v1.scope,
      keyConfigured: v1.hasCredentials,
      publicDiscovery: true,
      tokenCached: v1Token.cached,
      tokenExpiresIn: v1Token.expiresIn,
      tokenExpiresAt: v1Token.expiresAt,
      lastAuthAt: v1Token.lastAuthAt,
      hint: v1.hasCredentials ? null : credentialHint("v1"),
    },
    v2: {
      baseUrl: v2.baseUrl,
      publicBaseUrl: null,
      tokenUrl: v2.tokenUrl,
      scope: v2.scope,
      keyConfigured: v2.hasCredentials,
      publicDiscovery: false,
      tokenCached: v2Token.cached,
      tokenExpiresIn: v2Token.expiresIn,
      tokenExpiresAt: v2Token.expiresAt,
      lastAuthAt: v2Token.lastAuthAt,
      hint: v2.hasCredentials ? null : credentialHint("v2"),
    },
    tokenCache: durableCacheStatus(),
    supabase: storageConfigStatus(),
    database: {
      // Names only — never values. Actual target validated by db:validate.
      connectionSource: (process.env.DATABASE_URL_CONNECTION_STRING ?? "").trim()
        ? "DATABASE_URL_CONNECTION_STRING"
        : "DATABASE_URL (deprecated fallback)",
    },
    filters: {
      // Tri-state echo (boolean|null) — safe default visible, never a secret.
      familyFilterDefault: familyFilter,
      localizationDefault: defaultLocalization(),
    },
    metricsPolicy: {
      // Application-tracked counters (local); NOT official Dailymotion quota.
      source: "application-tracked",
      dayBoundary: "UTC midnight (YYYY-MM-DD, UTC)",
    },
  });
}
