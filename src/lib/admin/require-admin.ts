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
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const store = await cookies();

  // 1. Check stateless HMAC admin session cookie
  const hmacSession = verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
  if (hmacSession) {
    return {
      username: hmacSession.username,
      expiresAt: hmacSession.expiresAt,
      authSource: "admin_hmac",
    };
  }

  // 2. Authoritative check: Supabase Auth SSR session
  try {
    const serverSession = await getServerAuthSession();
    if (serverSession.authenticated && serverSession.isAdmin && serverSession.user) {
      return {
        username: serverSession.user.username || CANONICAL_ADMIN_USERNAME,
        expiresAt: Date.now() + 7 * 86400 * 1000,
        email: serverSession.user.email,
        ownerId: serverSession.ownerId ?? undefined,
        authSource: serverSession.authSource,
      };
    }
  } catch {
    // Non-fatal fallback for isolated test environments
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
