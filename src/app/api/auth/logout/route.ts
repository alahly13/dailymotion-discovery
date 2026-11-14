// POST /api/auth/logout — Authenticated User & Administrator Logout
//
// What this controls:
// 1. Invokes supabase.auth.signOut() to terminate the Supabase session.
// 2. Clears the dm_admin_session cookie.
// 3. Emits Cache-Control: no-store headers to prevent back-navigation exposure.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/session";

export async function POST() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // 1. Terminate Supabase Auth SSR session
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
                // Ignore in contexts with immutable headers
              }
            },
          },
        }
      );

      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[auth/logout] Supabase signOut notice:", err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Prepare JSON response
  const response = NextResponse.json({
    ok: true,
    message: "Signed out successfully.",
  });

  // 3. Clear admin session cookie
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  // 4. Also explicitly clear any Supabase session cookies present
  for (const c of allCookies) {
    if (c.name.startsWith("sb-") || c.name.includes("auth-token")) {
      response.cookies.set(c.name, "", {
        path: "/",
        maxAge: 0,
      });
    }
  }

  // 5. Anti-caching headers for sensitive post-logout state
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
