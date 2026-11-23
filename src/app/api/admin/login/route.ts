// POST /api/admin/login — operator login. Sets an httpOnly session cookie.
// Authenticates asdy against Supabase Auth using canonical email asdy@dailymotion.discov.com.
// Server-side username-to-email mapping prevents leaking identity mapping to unauthenticated clients.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import {
  ADMIN_COOKIE_NAME,
  CANONICAL_ADMIN_USERNAME,
  adminSessionMaxAge,
  createAdminSession,
  isAdminConfigured,
  resolveAdminEmail,
  verifyAdminCredentials,
} from "@/lib/admin/session";

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Admin login is not configured.", reason: "missing_config" },
      { status: 503 }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body.", reason: "user_input_error" }, { status: 400 });
  }

  const rawUsername = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!rawUsername || !password) {
    return NextResponse.json({ ok: false, error: "Username and password are required.", reason: "user_input_error" }, { status: 400 });
  }

  const targetEmail = resolveAdminEmail(rawUsername);
  let authenticated = false;
  let authenticatedUsername = CANONICAL_ADMIN_USERNAME;

  const capturedCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  // 1. Authenticate against Supabase Auth if credentials map to canonical admin and Supabase is configured
  if (targetEmail && publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    try {
      const cookieStore = await cookies();
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
                  capturedCookies.push({ name, value, options });
                });
              } catch {
                // Ignore if environment does not allow setting on cookieStore synchronously
              }
            },
          },
        }
      );

      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

      if (!error && data?.user) {
        authenticated = true;
        authenticatedUsername = CANONICAL_ADMIN_USERNAME;
      }
    } catch (err) {
      console.warn("[admin/login] Supabase auth attempt notice:", err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Fallback check for test environments / offline local development
  if (!authenticated) {
    if (verifyAdminCredentials(rawUsername, password)) {
      authenticated = true;
      authenticatedUsername = rawUsername;
    }
  }

  if (!authenticated) {
    // Non-differentiated error: never reveal whether username exists
    return NextResponse.json({ ok: false, error: "Invalid credentials.", reason: "unauthorized" }, { status: 401 });
  }

  const token = createAdminSession(authenticatedUsername);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Could not create session.", reason: "unknown" }, { status: 500 });
  }

  const maxAge = adminSessionMaxAge();
  const response = NextResponse.json({ ok: true, username: authenticatedUsername, maxAge });

  // Forward captured Supabase SSR cookies onto HTTP response headers
  for (const c of capturedCookies) {
    response.cookies.set(c.name, c.value, c.options as any);
  }

  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return response;
}
