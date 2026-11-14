// Admin status + logout endpoints (no secrets in responses).
// Fulfills both GET status checks and POST session invalidation with Supabase Auth SSR signout.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import { ADMIN_COOKIE_NAME, isAdminConfigured, verifyAdminSession } from "@/lib/admin/session";

export async function GET() {
  const store = await cookies();
  const session = verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
  return NextResponse.json({
    ok: true,
    configured: isAdminConfigured(),
    authenticated: session !== null,
    username: session?.username ?? null,
    expiresAt: session?.expiresAt ?? null,
  });
}

export async function POST() {
  const cookieStore = await cookies();

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
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
