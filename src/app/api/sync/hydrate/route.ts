import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { hydrateDatasetsFromCloud } from "@/lib/persistence/r2-sync-service";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const payload = await hydrateDatasetsFromCloud();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Hydration failed." },
      { status: 500 }
    );
  }
}
