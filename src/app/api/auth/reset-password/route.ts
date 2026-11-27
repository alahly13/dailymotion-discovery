// POST /api/auth/reset-password — Request Password Reset via Supabase Auth
//
// What this controls:
// Initiates password recovery email using official Supabase Auth SSR.
// Returns a safe non-revealing confirmation.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, publicEnv } from "@/lib/config/public-env";
import { resolveUserIdentifier } from "@/lib/auth/authorization";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON request body.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const rawEmail = (body.email || "").trim();
  if (!rawEmail) {
    return NextResponse.json(
      { ok: false, error: "Account email is required.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const targetEmail = resolveUserIdentifier(rawEmail);

  if (isSupabaseConfigured()) {
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
                });
              } catch {
                // Ignore in read-only cookie contexts
              }
            },
          },
        }
      );

      // Anchor recovery link to configured app URL or request URL origin (never raw spoofable headers)
      const configuredOrigin = (() => {
        try {
          return new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
        } catch {
          return new URL(request.url).origin;
        }
      })();
      const requestOrigin = new URL(request.url).origin;
      const safeOrigin = requestOrigin === configuredOrigin ? requestOrigin : configuredOrigin;
      const redirectUrl = `${safeOrigin}/auth/callback?type=recovery`;

      await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: redirectUrl,
      });
    } catch (err) {
      console.warn("[auth/reset-password] Supabase reset notice:", err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    ok: true,
    message: "If an account matches this identifier, password recovery instructions have been sent.",
  });
}
