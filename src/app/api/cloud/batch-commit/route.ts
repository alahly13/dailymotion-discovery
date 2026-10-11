// POST /api/cloud/batch-commit — one-click Save (admin only).
// Coordinates Storage snapshots + Prisma transaction via the orchestrator.
// Idempotent by idempotencyKey. Sanitized results; no secrets/tokens.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { commitBatch } from "@/lib/persistence/batch-save/commit";
import { PersistenceUnavailableError } from "@/lib/persistence/repositories/errors";

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body.", reason: "user_input_error" }, { status: 400 });
  }
  try {
    const result = await commitBatch(body);
    if (!result.ok) {
      const status = result.error?.includes("Invalid batch") ? 400 : 503;
      return NextResponse.json({ ...result, reason: status === 400 ? "user_input_error" : "unavailable" }, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message, reason: "unavailable", remedy: "Drafts stay local; retry later." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Batch commit failed.", reason: "unknown" }, { status: 500 });
  }
}
