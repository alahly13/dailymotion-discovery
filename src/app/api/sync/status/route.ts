import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getStorageExplorerOverview } from "@/lib/storage/storage-explorer-service";
import { getConfiguredStorageOwner } from "@/lib/storage/r2-canonical-paths";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const overview = await getStorageExplorerOverview({
      ownerId: gate.admin.ownerId ?? getConfiguredStorageOwner(),
    });
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync status check failed." },
      { status: 500 }
    );
  }
}
