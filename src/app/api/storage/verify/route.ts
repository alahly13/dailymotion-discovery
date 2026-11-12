import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { verifyR2DatasetsIntegrity } from "@/lib/storage/storage-explorer-service";

export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const verification = await verifyR2DatasetsIntegrity();
    return NextResponse.json(verification, { status: verification.error ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "R2 integrity verification failed." },
      { status: 500 }
    );
  }
}
