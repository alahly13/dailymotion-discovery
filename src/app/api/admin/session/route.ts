// Admin status + logout endpoints (no secrets in responses).
// Fulfills both GET status checks and POST session invalidation with Supabase Auth SSR signout.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import {
  ADMIN_COOKIE_NAME,
  CANONICAL_ADMIN_EMAIL,
  CANONICAL_ADMIN_USERNAME,
  isAdminConfigured,
  verifyAdminSession,
} from "@/lib/admin/session";
import { getServerAuthSession, type AuthSessionResult } from "@/lib/auth/auth-service";

export async function GET() {
  const store = await cookies();
  const hmacSession = verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);

  let serverSession: AuthSessionResult | null = null;
  try {
    serverSession = await getServerAuthSession();
  } catch (err) {
    console.warn("[admin/session] Failed retrieving server auth session:", err);
  }

  const isAuthenticated = Boolean(serverSession?.authenticated) || Boolean(hmacSession);
  const isAdmin = Boolean(serverSession?.isAdmin) || Boolean(hmacSession);

  const username =
    serverSession?.user?.username ||
    (serverSession?.user?.email ? serverSession.user.email.split("@")[0] : null) ||
    hmacSession?.username ||
    (isAuthenticated ? CANONICAL_ADMIN_USERNAME : null);

  const email =
    serverSession?.user?.email ||
    (hmacSession ? CANONICAL_ADMIN_EMAIL : null);

  const ownerId = serverSession?.ownerId || (hmacSession ? "asdy-admin-id" : null);

  const expiresAt =
    hmacSession?.expiresAt ?? (isAuthenticated ? Date.now() + 7 * 86400 * 1000 : null);

  const authSource = serverSession?.authenticated
    ? serverSession.authSource
    : hmacSession
    ? "admin_hmac"
    : "none";

  return NextResponse.json(
    {
      ok: true,
      configured: isAdminConfigured() || Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL),
      authenticated: isAuthenticated,
      username,
      email,
      ownerId,
      isAdmin,
      authSource,
      expiresAt,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}

export async function POST() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Terminate Supabase Auth SSR session if configured
  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    try {
      const supabase = createServerClient(
        publicEnv.NEXT_PUBLIC_SUPABASE_URL,
        publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) => {
                  cookieStore.set(name, value, options);
                });
              } catch {
                // Ignore if in context where cookie mutation is restricted
              }
            },
          },
        }
      );

      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[admin/session] Supabase signOut notice:", err instanceof Error ? err.message : String(err));
    }
  }

  const response = NextResponse.json({ ok: true, message: "Logged out successfully." });

  // Invalidate admin session cookie
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  // Explicitly clear all Supabase and auth-token cookies on response
  for (const c of allCookies) {
    if (c.name.startsWith("sb-") || c.name.includes("auth-token") || c.name.includes("session")) {
      response.cookies.set(c.name, "", {
        path: "/",
        maxAge: 0,
      });
    }
  }

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
