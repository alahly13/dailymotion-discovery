import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/auth-service";
import { executeSaveAll } from "@/lib/persistence/r2-sync-service";
import { PersistenceUnavailableError } from "@/lib/persistence/repositories/errors";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  try {
    // Authoritatively scope cloud storage commit to the verified server owner UUID
    const receipt = await executeSaveAll(body, { ownerId: auth.ownerId });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          remedy: "All changes remain safely queued in IndexedDB outbox for automatic retry.",
        },
        { status: 503 }
      );
    }
    const message = error instanceof Error ? error.message : "Save All failed.";
    const status = message.startsWith("Invalid sync payload") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
