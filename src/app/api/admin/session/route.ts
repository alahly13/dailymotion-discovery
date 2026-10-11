// Admin status + logout endpoints (no secrets in responses).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
