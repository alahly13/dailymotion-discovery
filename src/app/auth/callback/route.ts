// GET /auth/callback — Supabase Auth SSR Exchange Handler
//
// What this controls:
// Exchanges temporary code for durable Supabase SSR session cookies.
// Handles password recovery and account verification redirects.

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/config/public-env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") || "/";

  // Prevent open redirect
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const destinationUrl =
    type === "recovery"
      ? new URL("/account?view=change-password&status=recovery", requestUrl.origin)
      : new URL(safeNext, requestUrl.origin);

  let response = NextResponse.redirect(destinationUrl);

  if (code && isSupabaseConfigured()) {
    try {
      const supabase = createServerClient(
        publicEnv.NEXT_PUBLIC_SUPABASE_URL,
        publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              response = NextResponse.redirect(destinationUrl);
              cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
          },
        }
      );

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.warn("[auth/callback] Code exchange failed:", error.message);
        return NextResponse.redirect(new URL("/login?error=auth_callback_failed", requestUrl.origin));
      }
    } catch (err) {
      console.warn("[auth/callback] Code exchange notice:", err instanceof Error ? err.message : String(err));
      return NextResponse.redirect(new URL("/login?error=auth_callback_failed", requestUrl.origin));
    }
  } else if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_callback_missing_code", requestUrl.origin));
  }

  return response;
}
