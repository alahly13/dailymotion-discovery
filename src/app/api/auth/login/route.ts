// POST /api/auth/login — Authenticated User & Administrator Login Entrypoint
//
// What this controls:
// 1. Accepts identifier (username "asdy" or email "asdy@dailymotion.discov.com") and password.
// 2. Authenticates through Supabase Auth SSR via signInWithPassword.
// 3. Establishes the authoritative session cookies.
// 4. If the authenticated identity is the canonical administrator `asdy`, issues the 7-day HMAC admin session.
// 5. Does not disclose whether an account exists on failure.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import {
  ADMIN_COOKIE_NAME,
  CANONICAL_ADMIN_EMAIL,
  CANONICAL_ADMIN_USERNAME,
  adminSessionMaxAge,
  createAdminSession,
  verifyAdminCredentials,
} from "@/lib/admin/session";
import {
  isUserAdmin,
  resolveUserIdentifier,
} from "@/lib/auth/authorization";

export async function POST(request: Request) {
  let body: { identifier?: string; username?: string; email?: string; password?: string; remember?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON request body.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const rawIdentifier = (body.identifier || body.username || body.email || "").trim();
  const password = body.password || "";

  if (!rawIdentifier || !password) {
    return NextResponse.json(
      { ok: false, error: "Username/email and password are required.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const targetEmail = resolveUserIdentifier(rawIdentifier);
  let authenticatedUser: { id: string; email: string } | null = null;
  let isAdmin = false;

  const cookieStore = await cookies();
  const capturedCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  // 1. Supabase Auth SSR authentication
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
                  capturedCookies.push({ name, value, options });
                });
              } catch {
                // Ignore in contexts with immutable headers
              }
            },
          },
        }
      );

      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

      if (!error && data?.user?.id) {
        authenticatedUser = {
          id: data.user.id,
          email: data.user.email || targetEmail,
        };
        isAdmin = isUserAdmin(data.user);
      }
    } catch (err) {
      console.warn("[auth/login] Supabase auth attempt notice:", err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Test / local development fallback verification
  if (!authenticatedUser) {
    if (verifyAdminCredentials(rawIdentifier, password)) {
      authenticatedUser = {
        id: "asdy-admin-id",
        email: CANONICAL_ADMIN_EMAIL,
      };
      isAdmin = true;
    }
  }

  // 3. Generic failure response (never reveal user existence)
  if (!authenticatedUser) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid account identifier or password. Please check your credentials.",
        reason: "unauthorized",
      },
      { status: 401 }
    );
  }

  // 4. Create response and attach both Supabase cookies and admin session cookie
  const response = NextResponse.json({
    ok: true,
    user: authenticatedUser,
    isAdmin,
    ownerId: authenticatedUser.id,
  });

  // Explicitly forward captured Supabase SSR cookies onto HTTP response headers
  for (const c of capturedCookies) {
    response.cookies.set(c.name, c.value, c.options as any);
  }

  if (isAdmin) {
    const adminToken = createAdminSession(authenticatedUser.email?.split("@")[0] || CANONICAL_ADMIN_USERNAME);
    if (adminToken) {
      const maxAge = adminSessionMaxAge();
      response.cookies.set(ADMIN_COOKIE_NAME, adminToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge,
      });
    }
  }

  return response;
}
