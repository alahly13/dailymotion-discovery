// Admin authorization helper for private server routes.
//
// What this controls: single-admin gating for Prisma CRUD, Storage ops,
// batch commits, migration diagnostics, and connectivity checks.
// Why: the app has ONE admin account with HMAC sessions; client-supplied
// flags/usernames are never proof. Every private route awaits this.
// Scope: server routes only. Returns sanitized 401 JSON on failure.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSession } from "@/lib/admin/session";

export interface AdminIdentity {
  username: string;
  expiresAt: number;
}

/** Current admin identity from the session cookie, or null. */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const store = await cookies();
  const session = verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
  if (!session) return null;
  return { username: session.username, expiresAt: session.expiresAt };
}

/** Gate helper: returns identity or a ready-made 401 response. */
export async function requireAdmin(): Promise<{ ok: true; admin: AdminIdentity } | { ok: false; response: NextResponse }> {
  const admin = await getAdminIdentity();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Administrator sign-in required.", reason: "unauthorized" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, admin };
}
