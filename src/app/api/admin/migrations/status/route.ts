// GET /api/admin/migrations/status — schema + data migration diagnostics.
// Admin only. Distinguishes Prisma schema state from application data
// migrations, plus connectivity + storage checks. Best-effort everywhere:
// nothing is fabricated — unavailable backends report as such.
// No SQL execution endpoint; apply flows stay in CLI/CI.

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getPrismaClient } from "@/lib/db/prisma";
import { resolveDatabaseUrl } from "@/lib/db/database-url";
import { checkStorage } from "@/lib/persistence/storage-documents/documents";

interface AppliedMigration {
  migration_name: string;
  finished_at: Date | null;
}

async function prismaMigrationState() {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  let known: string[] = [];
  try {
    known = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(migrationsDir, e.name, "migration.sql")))
      .map((e) => e.name)
      .sort();
  } catch {
    known = [];
  }
  let db;
  try {
    db = getPrismaClient();
  } catch (error) {
    return { reachable: false as const, error: error instanceof Error ? error.message : "DB unavailable.", known, applied: [], pending: known };
  }
  try {
    await db.$executeRaw`SELECT 1`;
  } catch {
    return { reachable: false as const, error: "Database unreachable (SELECT 1 failed).", known, applied: [], pending: known };
  }
  try {
    const applied = (await db.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at ASC NULLS LAST`) as AppliedMigration[];
    const appliedNames = new Set(applied.map((m) => m.migration_name));
    return {
      reachable: true as const,
      error: null,
      known,
      applied: applied.map((m) => ({ name: m.migration_name, finishedAt: m.finished_at })),
      pending: known.filter((name) => !appliedNames.has(name)),
    };
  } catch {
    return { reachable: true as const, error: "Connected, but _prisma_migrations is unreadable (no migration baseline yet).", known, applied: [], pending: known };
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  let connectionSource = "unknown";
  try {
    resolveDatabaseUrl();
    connectionSource = (process.env.DATABASE_URL_CONNECTION_STRING ?? "").trim() ? "DATABASE_URL_CONNECTION_STRING" : "DATABASE_URL (deprecated fallback)";
  } catch {
    connectionSource = "unconfigured";
  }

  const [schema, storage] = await Promise.all([
    prismaMigrationState(),
    checkStorage().catch(() => ({
      urlConfigured: false, secretConfigured: false, bucketExists: null, bucketPrivate: null,
      probeUpload: null, probeReadBack: null, probeCleanup: null, error: "Storage check crashed.",
    })),
  ]);

  let dataRuns: unknown[] = [];
  let dataRunsError: string | null = null;
  if (schema.reachable) {
    try {
      const db = getPrismaClient();
      dataRuns = await db.dataMigrationRun.findMany({ orderBy: { updatedAt: "desc" }, take: 100 });
    } catch {
      dataRunsError = "Data-migration ledger unreadable (table may be pending migration).";
    }
  } else {
    dataRunsError = "Database unreachable — ledger unavailable.";
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    database: { connectionSource, ...schema },
    dataMigrations: { runs: dataRuns, error: dataRunsError },
    storage,
  });
}
