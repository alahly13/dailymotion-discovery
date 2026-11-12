import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { executeSaveAll } from "@/lib/persistence/r2-sync-service";
import { PersistenceUnavailableError } from "@/lib/persistence/repositories/errors";

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  try {
    const receipt = await executeSaveAll(body);
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
