import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { hydrateDatasetsFromCloud } from "@/lib/persistence/r2-sync-service";
import { getConfiguredStorageOwner } from "@/lib/storage/r2-canonical-paths";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    // Scope hydration to verified admin Supabase UUID when present so reads match Save All writes
    const payload = await hydrateDatasetsFromCloud({
      ownerId: gate.admin.ownerId ?? getConfiguredStorageOwner(),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Hydration failed." },
      { status: 500 }
    );
  }
}
