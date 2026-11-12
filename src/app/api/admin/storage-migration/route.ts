import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import {
  executeSupabaseToR2Migration,
  previewSupabaseToR2Migration,
} from "@/lib/persistence/supabase-to-r2-migration";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const preview = await previewSupabaseToR2Migration();
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to inspect migration state." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { dryRun?: boolean; batchTag?: string } = {};
  try {
    body = (await request.json()) as { dryRun?: boolean; batchTag?: string };
  } catch {
    body = { dryRun: true };
  }

  try {
    const result = await executeSupabaseToR2Migration({
      dryRun: body.dryRun ?? true,
      batchTag: body.batchTag,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Storage migration execution failed." },
      { status: 500 }
    );
  }
}
