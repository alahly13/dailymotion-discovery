import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getPrismaClient } from "@/lib/prisma/client";
import { PersistenceUnavailableError, toPersistenceError } from "@/lib/persistence/repositories/errors";
import { listHistory } from "@/lib/persistence/repositories/search-history";

function handleError(error: unknown, fallback: string) {
  const mapped = toPersistenceError(error);
  if (mapped instanceof PersistenceUnavailableError) {
    return NextResponse.json({ ok: false, error: mapped.message, reason: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: mapped.message || fallback, reason: "unknown" }, { status: 500 });
}

/** GET /api/cloud/history — fetch persisted discovery search history rows from Postgres (admin only). */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const rawVersion = url.searchParams.get("version")?.trim();
  const apiVersion = rawVersion === "v1" || rawVersion === "v2" ? rawVersion : undefined;
  const take = Number(url.searchParams.get("take") ?? 200);

  try {
    const db = getPrismaClient();
    const entries = await listHistory(db, apiVersion, Number.isFinite(take) ? take : 200);
    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return handleError(error, "Could not load search history.");
  }
}

/** DELETE /api/cloud/history — delete a single persisted SearchHistory entry by id (admin only). */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Provide ?id=<historyId> to remove a persisted search row.", reason: "user_input_error" },
      { status: 400 },
    );
  }

  try {
    const db = getPrismaClient();
    await db.searchHistory.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    return handleError(error, "Could not delete history entry.");
  }
}
