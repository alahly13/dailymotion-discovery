// GET /api/cloud/sync-state — authoritative server counts (admin only).
// Lets the UI show saved-vs-pending honestly. Best-effort 503 when DB down.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getPrismaClient } from "@/lib/db/prisma";
import { PersistenceUnavailableError, toPersistenceError } from "@/lib/persistence/repositories/errors";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  let db;
  try {
    db = getPrismaClient();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Database unavailable.", reason: "unavailable" }, { status: 503 });
  }
  try {
    const [savedCount, historyCount, historyV1, historyV2, collections, lastCommit, documents] = await Promise.all([
      db.savedVideo.count(),
      db.searchHistory.count(),
      db.searchHistory.count({ where: { apiVersion: "v1" } }),
      db.searchHistory.count({ where: { apiVersion: "v2" } }),
      db.collection.count(),
      db.batchCommit.findFirst({ orderBy: { createdAt: "desc" } }),
      db.storageDocument.count(),
    ]);
    return NextResponse.json({
      ok: true,
      savedCount,
      historyCount,
      historyByVersion: { v1: historyV1, v2: historyV2 },
      collectionCount: collections,
      documentCount: documents,
      lastCommit: lastCommit
        ? { idempotencyKey: lastCommit.idempotencyKey, status: lastCommit.status, completedAt: lastCommit.completedAt, savedUpserts: lastCommit.savedUpserts, historyAppended: lastCommit.historyAppended }
        : null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toPersistenceError(error);
    if (mapped instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, error: mapped.message, reason: "unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Sync state unavailable.", reason: "unknown" }, { status: 500 });
  }
}
