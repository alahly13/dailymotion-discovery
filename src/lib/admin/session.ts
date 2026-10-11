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

import { createHmac, timingSafeEqual } from "node:crypto";
import { optionalServerEnv } from "@/lib/config/env";

export const ADMIN_COOKIE_NAME = "dm_admin_session";

function adminConfig() {
  return {
    username: optionalServerEnv.ADMIN_DEFAULT_USERNAME || "admin",
    password: optionalServerEnv.ADMIN_INITIAL_PASSWORD ?? "",
    secret: optionalServerEnv.ADMIN_SESSION_SECRET ?? "",
    ttlSeconds: optionalServerEnv.ADMIN_SESSION_TTL_SECONDS || 604800,
  };
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
  return safeEqual(username.trim(), config.username) && safeEqual(password, config.password);
}

interface AdminPayload {
  u: string;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSession(username: string): string | null {
  const { secret, ttlSeconds } = adminConfig();
  if (!secret) return null;
  const payload: AdminPayload = { u: username, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
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
