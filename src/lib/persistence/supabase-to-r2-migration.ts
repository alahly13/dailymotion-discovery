import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { downloadDocumentText } from "@/lib/persistence/storage-documents/documents";
import { getConfiguredStorageOwner, legacyArchiveObjectKey } from "@/lib/storage/r2-canonical-paths";
import { R2WorkerClient } from "@/lib/storage/r2-worker-client";

/**
 * Non-destructive Supabase Storage (`application-data`) -> Cloudflare R2 archive helper.
 *
 * Guarantees:
 *   1. Reads known object paths strictly from PostgreSQL `storage_documents`.
 *   2. Copies verified JSON envelopes into `dailymotion/persistence/<owner>/legacy-supabase-archive/...`.
 *   3. NEVER deletes or modifies existing Supabase Storage objects.
 */

export interface LegacyMigrationPreview {
  ownerId: string;
  workerConfigured: boolean;
  dbReachable: boolean;
  totalRegisteredDocuments: number;
  alreadyArchivedInR2: number;
  pendingCopyCount: number;
  documents: Array<{
    path: string;
    domain: string;
    apiVersion: string | null;
    revision: number;
    checksum: string | null;
    byteSize: number | null;
    targetR2Key: string;
    archivedInR2: boolean;
  }>;
  warnings: string[];
}

export async function previewSupabaseToR2Migration(deps?: {
  db?: PrismaClient | null;
  r2Client?: R2WorkerClient;
  ownerId?: string;
  batchTag?: string;
}): Promise<LegacyMigrationPreview> {
  const ownerId = deps?.ownerId ?? getConfiguredStorageOwner();
  const batchTag = deps?.batchTag ?? "supabase-v1-archive";
  const r2Client = deps?.r2Client ?? new R2WorkerClient();
  const warnings: string[] = [];

  let db: PrismaClient | null = deps?.db ?? null;
  if (db === undefined || db === null) {
    try {
      db = getPrismaClient();
    } catch {
      db = null;
    }
  }

  let docs: Array<{
    path: string;
    domain: string;
    apiVersion: string | null;
    revision: number;
    checksum: string | null;
    byteSize: bigint | null;
  }> = [];

  let dbReachable = false;
  if (db) {
    try {
      docs = await db.storageDocument.findMany({ orderBy: { createdAt: "asc" } });
      dbReachable = true;
    } catch (err) {
      warnings.push(`Could not query storage_documents: ${err instanceof Error ? err.message : "DB error"}`);
    }
  } else {
    warnings.push("Database connection not available.");
  }

  const existingArchiveKeys = new Set<string>();
  if (r2Client.configured) {
    try {
      const listed = await r2Client.listPrefix(ownerId, `dailymotion/persistence/${ownerId}/legacy-supabase-archive/`);
      for (const obj of listed) {
        existingArchiveKeys.add(obj.key);
      }
    } catch (err) {
      warnings.push(`Could not list R2 archive prefix: ${err instanceof Error ? err.message : "Worker error"}`);
    }
  } else {
    warnings.push("Cloudflare R2 Worker is not configured yet (dry-run preview only).");
  }

  const mapped = docs.map((doc) => {
    const targetR2Key = legacyArchiveObjectKey(ownerId, batchTag, doc.path);
    const archivedInR2 = existingArchiveKeys.has(targetR2Key);
    return {
      path: doc.path,
      domain: doc.domain,
      apiVersion: doc.apiVersion,
      revision: doc.revision,
      checksum: doc.checksum,
      byteSize: doc.byteSize !== null ? Number(doc.byteSize) : null,
      targetR2Key,
      archivedInR2,
    };
  });

  const alreadyArchivedInR2 = mapped.filter((m) => m.archivedInR2).length;
  return {
    ownerId,
    workerConfigured: r2Client.configured,
    dbReachable,
    totalRegisteredDocuments: mapped.length,
    alreadyArchivedInR2,
    pendingCopyCount: mapped.length - alreadyArchivedInR2,
    documents: mapped,
    warnings,
  };
}

export async function executeSupabaseToR2Migration(options?: {
  dryRun?: boolean;
  batchTag?: string;
  db?: PrismaClient | null;
  r2Client?: R2WorkerClient;
}) {
  const dryRun = options?.dryRun ?? true;
  const preview = await previewSupabaseToR2Migration(options);
  if (dryRun || !preview.workerConfigured) {
    return {
      ok: true,
      dryRun: true,
      copiedCount: 0,
      verifiedCount: 0,
      failedCount: 0,
      failures: [] as Array<{ path: string; reason: string }>,
      preview,
    };
  }

  const r2Client = options?.r2Client ?? new R2WorkerClient();
  let copiedCount = 0;
  let verifiedCount = 0;
  const failures: Array<{ path: string; reason: string }> = [];

  for (const doc of preview.documents) {
    if (doc.archivedInR2) {
      verifiedCount += 1;
      continue;
    }

    const rawText = await downloadDocumentText(doc.path);
    if (rawText === null) {
      failures.push({ path: doc.path, reason: "Missing in Supabase Storage application-data bucket" });
      continue;
    }

    const sha256 = crypto.createHash("sha256").update(rawText, "utf8").digest("hex");
    if (doc.checksum && doc.checksum !== sha256) {
      failures.push({ path: doc.path, reason: `Checksum mismatch against DB registry (${doc.checksum} !== ${sha256})` });
      continue;
    }

    try {
      await r2Client.putObject(preview.ownerId, doc.targetR2Key, rawText, { sha256 });
      copiedCount += 1;
      verifiedCount += 1;
    } catch (err) {
      failures.push({ path: doc.path, reason: err instanceof Error ? err.message : "R2 upload error" });
    }
  }

  return {
    ok: failures.length === 0,
    dryRun: false,
    copiedCount,
    verifiedCount,
    failedCount: failures.length,
    failures,
    preview: await previewSupabaseToR2Migration(options),
  };
}
