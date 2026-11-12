// POST /api/admin/change-password — Authenticated administrator password change.
// Updates administrator password directly in Supabase Auth (the sole password authority).
// Requires valid admin session; re-authenticates current password before changing.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/config/public-env";
import { requireAdmin } from "@/lib/admin/require-admin";
import { resolveAdminEmail, CANONICAL_ADMIN_USERNAME } from "@/lib/admin/session";

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request.", reason: "user_input_error" }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: "Current password is required." }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "New password must be at least 8 characters long." }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ ok: false, error: "New passwords do not match." }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ ok: false, error: "New password must be different from current password." }, { status: 400 });
  }

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.json({ ok: false, error: "Supabase service is not configured." }, { status: 503 });
  }

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
            // Ignore if setting cookies synchronously is restricted
          }
        },
      },
    }
  );

  const targetEmail = resolveAdminEmail(gate.admin.username) || resolveAdminEmail(CANONICAL_ADMIN_USERNAME);
  if (!targetEmail) {
    return NextResponse.json({ ok: false, error: "Could not resolve administrator identity." }, { status: 400 });
  }

  // 1. Verify current password
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: targetEmail,
    password: currentPassword,
  });

  if (signInErr || !signInData?.user) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 401 });
  }

  // 2. Update password in Supabase Auth
  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: updateErr.message || "Failed to update password in Supabase Auth." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Administrator password updated successfully in Supabase Auth.",
  });
}
