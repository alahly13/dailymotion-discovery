// POST /api/admin/login — operator login. Sets an httpOnly session cookie.

import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminSessionMaxAge,
  createAdminSession,
  isAdminConfigured,
  verifyAdminCredentials,
} from "@/lib/admin/session";

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Admin login is not configured. Set ADMIN_INITIAL_PASSWORD and ADMIN_SESSION_SECRET.", reason: "missing_config" },
      { status: 503 }
    );
  }
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body.", reason: "user_input_error" }, { status: 400 });
  }
  if (!verifyAdminCredentials(body.username ?? "", body.password ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid credentials.", reason: "unauthorized" }, { status: 401 });
  }
  const token = createAdminSession((body.username ?? "").trim());
  if (!token) {
    return NextResponse.json({ ok: false, error: "Could not create session.", reason: "unknown" }, { status: 500 });
  }
  const response = NextResponse.json({ ok: true, maxAge: adminSessionMaxAge() });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionMaxAge(),
  });
  return response;
}
