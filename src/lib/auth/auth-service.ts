/**
 * Centralized Server-Side Supabase SSR Authentication & Session Service (2026)
 *
 * What this controls:
 * 1. Verified server-side session extraction via Supabase SSR `getUser()`.
 * 2. Route gating helpers `requireAuth()` and `requireAdminAuth()`.
 * 3. Fallback compatibility with stateless HMAC admin session cookie for tests and offline dev.
 * 4. Authoritative owner UUID derivation.
 *
 * Scope: Server-only Next.js App Router and API routes.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import {
  ADMIN_COOKIE_NAME,
  CANONICAL_ADMIN_EMAIL,
  CANONICAL_ADMIN_USERNAME,
  verifyAdminSession,
} from "@/lib/admin/session";
import {
  isUserAdmin,
  resolveAuthoritativeOwnerId,
} from "./authorization";

export interface AuthenticatedUser {
  id: string;
  email: string;
  username?: string;
}

export interface AuthSessionResult {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  ownerId: string | null;
  isAdmin: boolean;
  authSource: "supabase" | "admin_hmac" | "none";
}

/**
 * Creates a server-side Supabase client using current request cookies.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return typeof cookieStore.getAll === "function" ? cookieStore.getAll() : [];
        },
        setAll(cookiesToSet) {
          try {
            if (typeof cookieStore.set === "function") {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            }
          } catch {
            // Can occur in Server Components where cookies are read-only
          }
        },
      },
    }
  );
}

/**
 * Authoritatively retrieves the current authenticated session on the server.
 * Never trusts client headers or client-supplied bodies.
 */
export async function getServerAuthSession(): Promise<AuthSessionResult> {
  const cookieStore = await cookies();
  const allCookies = typeof cookieStore.getAll === "function" ? cookieStore.getAll() : [];
  const hasSupabaseCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") || c.name.includes("auth-token")
  );

  // 1. Primary check: Supabase Auth SSR via verified getUser() (executed only if Supabase cookies exist)
  if (
    hasSupabaseCookie &&
    publicEnv.NEXT_PUBLIC_SUPABASE_URL &&
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("example.supabase.co")
  ) {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!error && user && user.id) {
        const email = user.email || "";
        const isAdmin = isUserAdmin(user);
        const ownerId = resolveAuthoritativeOwnerId(user);

        return {
          authenticated: true,
          user: {
            id: user.id,
            email,
            username: email.split("@")[0] || CANONICAL_ADMIN_USERNAME,
          },
          ownerId,
          isAdmin,
          authSource: "supabase",
        };
      }
    } catch (err) {
      console.warn("[auth-service] Supabase getUser notice:", err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Secondary check: Stateless HMAC admin session cookie (used for tests or offline local dev)
  const adminCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const adminSession = verifyAdminSession(adminCookie);

  if (adminSession) {
    const ownerId = resolveAuthoritativeOwnerId(null, "asdy-admin-id");
    return {
      authenticated: true,
      user: {
        id: "asdy-admin-id",
        email: CANONICAL_ADMIN_EMAIL,
        username: adminSession.username || CANONICAL_ADMIN_USERNAME,
      },
      ownerId,
      isAdmin: true,
      authSource: "admin_hmac",
    };
  }

  return {
    authenticated: false,
    user: null,
    ownerId: null,
    isAdmin: false,
    authSource: "none",
  };
}

/**
 * Gate helper for protected routes. Returns verified user or ready-made 401 response.
 */
export async function requireAuth(): Promise<
  | { ok: true; user: AuthenticatedUser; ownerId: string; isAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerAuthSession();

  if (!session.authenticated || !session.user || !session.ownerId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Authentication required to access this resource.",
          reason: "unauthenticated",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      ),
    };
  }

  return {
    ok: true,
    user: session.user,
    ownerId: session.ownerId,
    isAdmin: session.isAdmin,
  };
}

/**
 * Gate helper for administrator-only routes. Returns verified admin or 401/403 response.
 */
export async function requireAdminAuth(): Promise<
  | { ok: true; user: AuthenticatedUser; ownerId: string; isAdmin: true }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;

  if (!auth.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Administrator authorization required.",
          reason: "forbidden",
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      ),
    };
  }

  return {
    ok: true,
    user: auth.user,
    ownerId: auth.ownerId,
    isAdmin: true,
  };
}
