// Admin session handling (stateless, server-only).
//
// What this controls: operator login for the local app admin area.
// Why it exists: ADMIN_* env names are required exactly; sessions are
// HMAC-signed cookies (no database table, no migration) with a default
// 7-day lifetime (ADMIN_SESSION_TTL_SECONDS=604800). This is the APPLICATION
// administrator session — unrelated to Dailymotion API authentication.
// Security: httpOnly + SameSite=Lax cookies, timing-safe credential compare,
// secrets never leave the server. Future agents: do not weaken compare logic
// or cookie flags to "fix" a login issue — check env wiring instead.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { optionalServerEnv } from "@/lib/config/env";

export const ADMIN_COOKIE_NAME = "dm_admin_session";
export const CANONICAL_ADMIN_USERNAME = "asdy";
export const CANONICAL_ADMIN_EMAIL = "asdy@dailymotion.discov.com";

/**
 * Resolves runtime administrator HMAC signing & bootstrap credential configuration.
 *
 * Security invariant: Never falls back to a hardcoded signing key in source control.
 * If `ADMIN_SESSION_SECRET` is unset, derives a domain-separated key only from configured
 * server secrets; otherwise returns empty secret so session signing and verification fail closed.
 * Scope: Admin session signing, credential fallback (only when Supabase Auth is unavailable).
 */
function adminConfig() {
  const rawEnvSecret = process.env.ADMIN_SESSION_SECRET;
  const isExplicitlyEmpty = rawEnvSecret === "";

  let secret = "";
  if (!isExplicitlyEmpty) {
    const primary = (rawEnvSecret ?? optionalServerEnv.ADMIN_SESSION_SECRET ?? "").trim();
    if (primary) {
      secret = primary;
    } else {
      const serverEntropy = (
        process.env.SUPABASE_SECRET_KEY ??
        optionalServerEnv.SUPABASE_SECRET_KEY ??
        process.env.TOKEN_CACHE_ENCRYPTION_KEY ??
        optionalServerEnv.TOKEN_CACHE_ENCRYPTION_KEY ??
        ""
      ).trim();
      if (serverEntropy) {
        secret = createHash("sha256")
          .update(`dm-admin-session-v1:${serverEntropy}`, "utf8")
          .digest("hex");
      }
    }
  }

  const parsedTtl = Number(process.env.ADMIN_SESSION_TTL_SECONDS ?? optionalServerEnv.ADMIN_SESSION_TTL_SECONDS ?? 604800);
  const ttlSeconds = Number.isFinite(parsedTtl) && parsedTtl > 0 ? Math.trunc(parsedTtl) : 604800;

  return {
    username: (process.env.ADMIN_DEFAULT_USERNAME ?? optionalServerEnv.ADMIN_DEFAULT_USERNAME ?? CANONICAL_ADMIN_USERNAME).trim() || CANONICAL_ADMIN_USERNAME,
    email: (process.env.ADMIN_EMAIL || CANONICAL_ADMIN_EMAIL).trim().toLowerCase(),
    password: process.env.ADMIN_INITIAL_PASSWORD ?? optionalServerEnv.ADMIN_INITIAL_PASSWORD ?? "",
    secret,
    ttlSeconds,
  };
}

/**
 * Resolves a username or email input to the canonical Supabase Auth email.
 * Accepts "asdy", "asdy@dailymotion.discov.com", or legacy "admin" (for test environments).
 * Returns null if unrecognized.
 */
export function resolveAdminEmail(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  const config = adminConfig();
  const validUsernames = [
    config.username.toLowerCase(),
    config.email.toLowerCase(),
    CANONICAL_ADMIN_USERNAME.toLowerCase(),
    CANONICAL_ADMIN_EMAIL.toLowerCase(),
    "admin",
  ];
  if (validUsernames.includes(normalized)) {
    return config.email;
  }
  return null;
}

export function isAdminConfigured(): boolean {
  const { password, secret } = adminConfig();
  return password.length > 0 && secret.length > 0;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const config = adminConfig();
  if (!isAdminConfigured()) return false;
  const normalized = username.trim().toLowerCase();
  const valid = [
    config.username.toLowerCase(),
    config.email.toLowerCase(),
    CANONICAL_ADMIN_USERNAME.toLowerCase(),
    "admin",
  ];
  const userMatches = valid.some((cand) => cand.length === normalized.length && safeEqual(cand, normalized));
  return userMatches && safeEqual(password, config.password);
}

interface AdminPayload {
  u: string;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function hasAdminSigningSecret(): boolean {
  return adminConfig().secret.length > 0;
}

export function createAdminSession(username: string, ttlOverrideSeconds?: number): string | null {
  const { secret, ttlSeconds } = adminConfig();
  if (!secret) return null;
  const effectiveTtl =
    typeof ttlOverrideSeconds === "number" && Number.isFinite(ttlOverrideSeconds) && ttlOverrideSeconds > 0
      ? Math.trunc(ttlOverrideSeconds)
      : ttlSeconds;
  const payload: AdminPayload = { u: username, exp: Math.floor(Date.now() / 1000) + effectiveTtl };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyAdminSession(token: string | undefined | null): { username: string; expiresAt: number } | null {
  if (!token) return null;
  const { secret } = adminConfig();
  if (!secret) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!safeEqual(sign(encoded, secret), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminPayload;
    if (typeof parsed.u !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp * 1000 < Date.now()) return null;
    return { username: parsed.u, expiresAt: parsed.exp * 1000 };
  } catch {
    return null;
  }
}

export function adminSessionMaxAge(): number {
  return adminConfig().ttlSeconds;
}
