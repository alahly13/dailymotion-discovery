// Admin authorization helper for private server routes.
//
// What this controls: administrator gating for Prisma CRUD, Storage ops,
// batch commits, migration diagnostics, and connectivity checks.
// Why: Unifies both HMAC-signed admin cookies (for test environments and offline dev)
// and Supabase Auth SSR verified sessions (canonical production authority).
// Client-supplied flags/usernames are never proof. Every private route awaits this.
// Scope: server routes only. Returns sanitized 401 JSON on failure.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, CANONICAL_ADMIN_USERNAME, verifyAdminSession } from "@/lib/admin/session";
import { getServerAuthSession } from "@/lib/auth/auth-service";

export interface AdminIdentity {
  username: string;
  expiresAt: number;
  email?: string;
  ownerId?: string;
  authSource?: string;
}

/** Current admin identity from the session cookie or Supabase Auth SSR, or null. */
/**
 * Resolves the active administrator identity.
 *
 * Security & namespace ordering:
 *   1. Check verified Supabase Auth SSR session FIRST when present, so `ownerId` (immutable
 *      UUID) and verified `email` are always preserved on `gate.admin` — preventing storage/sync
 *      endpoints (`hydrate`, `overview`, `verify`, `export`) from drifting into the default
 *      `"admin"` namespace when `dm_admin_session` coexists with a Supabase session.
 *   2. Reject if Supabase session is explicitly authenticated as a non-admin account (prevents
 *      stale HMAC cookie privilege escalation).
 *   3. Fall back to stateless HMAC admin cookie when no Supabase session is active.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const store = await cookies();
  const hmacSession = verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);

  try {
    const serverSession = await getServerAuthSession();
    if (serverSession.authenticated) {
      if (!serverSession.isAdmin || !serverSession.user) {
        return null;
      }
      return {
        username: serverSession.user.username || hmacSession?.username || CANONICAL_ADMIN_USERNAME,
        expiresAt: hmacSession?.expiresAt ?? Date.now() + 7 * 86400 * 1000,
        email: serverSession.user.email,
        ownerId: serverSession.ownerId ?? undefined,
        authSource: serverSession.authSource,
      };
    }
  } catch {
    // Non-fatal fallback for isolated test environments without Supabase session headers
  }

  if (hmacSession) {
    return {
      username: hmacSession.username,
      expiresAt: hmacSession.expiresAt,
      authSource: "admin_hmac",
    };
  }

  return null;
}

/** Gate helper: returns identity or a ready-made 401 response. */
export async function requireAdmin(): Promise<{ ok: true; admin: AdminIdentity } | { ok: false; response: NextResponse }> {
  const admin = await getAdminIdentity();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Administrator sign-in required.", reason: "unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      ),
    };
  }
  return { ok: true, admin };
}
