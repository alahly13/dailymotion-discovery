import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { buildWorkspaceExportZip } from "@/lib/storage/storage-explorer-service";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const bundle = await buildWorkspaceExportZip();
    return new NextResponse(new Uint8Array(bundle.zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bundle.filename}"`,
        "X-Export-Source": bundle.source,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build ZIP export." },
      { status: 500 }
    );
  }
}
