// POST /api/admin/logout — Comprehensive Supabase Auth SSR Sign Out & Session Invalidation
//
// What this controls:
// 1. Invokes supabase.auth.signOut() to terminate the Supabase session server-side.
// 2. Clears the dm_admin_session cookie with maxAge: 0.
// 3. Emits Cache-Control: no-store headers to prevent back-navigation cached access.
// Scope: Admin authentication.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/session";

export async function POST() {
  const cookieStore = await cookies();

  // 1. Terminate Supabase Auth SSR session if configured
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
      console.warn("[admin/logout] Supabase signOut notice:", err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Prepare response with invalidated application session cookie
  const response = NextResponse.json({ ok: true, message: "Signed out successfully." });

  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  // 3. Prevent browser back-forward caching of protected content
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
