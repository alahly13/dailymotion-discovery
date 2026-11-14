// GET /api/auth/session — Authenticated User Session Status
//
// What this controls:
// Returns current authenticated user facts, owner UUID, and admin status. Zero secrets returned.

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/auth-service";

export async function GET() {
  const session = await getServerAuthSession();

  return NextResponse.json(
    {
      ok: true,
      authenticated: session.authenticated,
      user: session.user,
      ownerId: session.ownerId,
      isAdmin: session.isAdmin,
      authSource: session.authSource,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
