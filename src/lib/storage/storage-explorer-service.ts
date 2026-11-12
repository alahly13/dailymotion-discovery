import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { CANONICAL_DATASET_SLUGS, datasetVersionPointerKey, getConfiguredStorageOwner, ownerScopePrefix } from "./r2-canonical-paths";
import { getR2WorkerConfig } from "./r2-capability-token";
import { type DatasetVersionPointer, type GenerationManifestDocument } from "./r2-manifest-serializer";
import { R2WorkerClient, type WorkerHealthResponse } from "./r2-worker-client";
import { createZipArchive } from "./zip-builder";
import { hydrateDatasetsFromCloud } from "@/lib/persistence/r2-sync-service";

/**
 * Storage Explorer, integrity verification, and untrimmed multi-format export service.
 */

export interface DatasetOverviewItem {
  datasetSlug: string;
  versionPointerKey: string;
  activeGenerationId: string | null;
  activeManifestKey: string | null;
  activeAggregateSha: string | null;
  recordCount: number;
  totalBytes: number;
  lastSyncedAt: string | null;
  source: "r2-worker" | "postgres" | "empty";
}

export interface StorageOverviewResult {
  ok: boolean;
  checkedAt: string;
  ownerId: string;
  bucketName: string;
  workerConfigured: boolean;
  workerHealth: WorkerHealthResponse | null;
  dbReachable: boolean;
  r2ObjectCount: number;
  r2TotalBytes: number;
  datasets: DatasetOverviewItem[];
  legacySupabaseDocCount: number;
  warnings: string[];
}

function safeDb(): PrismaClient | null {
  try {
    return getPrismaClient();
  } catch {
    return null;
  }
}

export async function getStorageExplorerOverview(deps?: {
  r2Client?: R2WorkerClient;
  db?: PrismaClient | null;
  ownerId?: string;
}): Promise<StorageOverviewResult> {
  const ownerId = deps?.ownerId ?? getConfiguredStorageOwner();
  const cfg = getR2WorkerConfig();
  const r2Client = deps?.r2Client ?? new R2WorkerClient();
  const db = deps?.db === undefined ? safeDb() : deps.db;
  const warnings: string[] = [];

  let workerHealth: WorkerHealthResponse | null = null;
  let r2Objects: Array<{ key: string; size: number }> = [];

  if (r2Client.configured) {
    try {
      workerHealth = await r2Client.health();
      r2Objects = await r2Client.listPrefix(ownerId, ownerScopePrefix(ownerId));
    } catch (err) {
      warnings.push(`Cloudflare Worker unreachable: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  let dbReachable = false;
  let dbDatasets: Array<{
    datasetSlug: string;
    versionPointerKey: string;
    activeGenerationId: string | null;
    activeManifestKey: string | null;
    activeAggregateSha: string | null;
    activeRecordCount: number;
    activeTotalBytes: bigint;
    lastSyncedAt: Date | null;
  }> = [];
  let legacySupabaseDocCount = 0;

  if (db) {
    try {
      [dbDatasets, legacySupabaseDocCount] = await Promise.all([
        db.storageDataset.findMany({ where: { ownerId } }),
        db.storageDocument.count(),
      ]);
      dbReachable = true;
    } catch (err) {
      warnings.push(`Database registry note: ${err instanceof Error ? err.message : "unavailable"}`);
    }
  }

  const dbMap = new Map(dbDatasets.map((d) => [d.datasetSlug, d]));
  const datasets: DatasetOverviewItem[] = [];

  for (const slug of CANONICAL_DATASET_SLUGS) {
    if (slug === "legacy-supabase-archive") continue;
    const pointerKey = datasetVersionPointerKey(ownerId, slug);
    let item: DatasetOverviewItem = {
      datasetSlug: slug,
      versionPointerKey: pointerKey,
      activeGenerationId: null,
      activeManifestKey: null,
      activeAggregateSha: null,
      recordCount: 0,
      totalBytes: 0,
      lastSyncedAt: null,
      source: "empty",
    };

    if (r2Client.configured && workerHealth?.ok) {
      try {
        const ptr = await r2Client.getObjectJson<DatasetVersionPointer>(ownerId, pointerKey);
        if (ptr?.data) {
          item = {
            datasetSlug: slug,
            versionPointerKey: pointerKey,
            activeGenerationId: ptr.data.activeGenerationId,
            activeManifestKey: ptr.data.manifestKey,
            activeAggregateSha: ptr.data.aggregateSha256,
            recordCount: ptr.data.recordCount,
            totalBytes: ptr.data.totalBytes,
            lastSyncedAt: ptr.data.committedAt,
            source: "r2-worker",
          };
        }
      } catch {
        // Skip empty pointer
      }
    }

    if (item.source === "empty") {
      const dbRow = dbMap.get(slug);
      if (dbRow) {
        item = {
          datasetSlug: slug,
          versionPointerKey: dbRow.versionPointerKey,
          activeGenerationId: dbRow.activeGenerationId,
          activeManifestKey: dbRow.activeManifestKey,
          activeAggregateSha: dbRow.activeAggregateSha,
          recordCount: dbRow.activeRecordCount,
          totalBytes: Number(dbRow.activeTotalBytes),
          lastSyncedAt: dbRow.lastSyncedAt ? dbRow.lastSyncedAt.toISOString() : null,
          source: "postgres",
        };
      }
    }

    datasets.push(item);
  }

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    ownerId,
    bucketName: cfg.bucketName,
    workerConfigured: r2Client.configured,
    workerHealth,
    dbReachable,
    r2ObjectCount: r2Objects.length,
    r2TotalBytes: r2Objects.reduce((acc, o) => acc + o.size, 0),
    datasets,
    legacySupabaseDocCount,
    warnings,
  };
}

export async function verifyR2DatasetsIntegrity(deps?: {
  r2Client?: R2WorkerClient;
  ownerId?: string;
}) {
  const ownerId = deps?.ownerId ?? getConfiguredStorageOwner();
  const r2Client = deps?.r2Client ?? new R2WorkerClient();

  if (!r2Client.configured) {
    return {
      ok: false,
      verifiedDatasets: 0,
      failedDatasets: 0,
      results: [] as Array<{
        datasetSlug: string;
        generationId: string | null;
        ok: boolean;
        verifiedParts: number;
        failedParts: number;
        reason?: string;
      }>,
      error: "Cloudflare R2 Worker is not configured.",
    };
  }

  const results: Array<{
    datasetSlug: string;
    generationId: string | null;
    ok: boolean;
    verifiedParts: number;
    failedParts: number;
    reason?: string;
  }> = [];

  for (const slug of CANONICAL_DATASET_SLUGS) {
    if (slug === "legacy-supabase-archive") continue;
    const pointer = await r2Client.getObjectJson<DatasetVersionPointer>(
      ownerId,
      datasetVersionPointerKey(ownerId, slug)
    );
    if (!pointer?.data?.manifestKey) continue;

    const manifest = await r2Client.getObjectJson<GenerationManifestDocument>(ownerId, pointer.data.manifestKey);
    if (!manifest?.data?.parts?.length) {
      results.push({
        datasetSlug: slug,
        generationId: pointer.data.activeGenerationId,
        ok: false,
        verifiedParts: 0,
        failedParts: 0,
        reason: "Manifest missing or empty parts array",
      });
      continue;
    }

    const scopePrefix = `dailymotion/persistence/${ownerId}/${slug}/generations/${manifest.data.generationId}`;
    const res = await r2Client.batchVerify(
      ownerId,
      scopePrefix,
      `verify-${Date.now()}`,
      manifest.data.parts.map((p) => ({ key: p.key, sha256: p.sha256, byteCount: p.byteCount }))
    );

    results.push({
      datasetSlug: slug,
      generationId: manifest.data.generationId,
      ok: res.ok && res.failedCount === 0,
      verifiedParts: res.verifiedCount,
      failedParts: res.failedCount,
      reason: res.failures.length > 0 ? res.failures.map((f) => `${f.key}:${f.reason}`).join("; ") : undefined,
    });
  }

  return {
    ok: results.every((r) => r.ok),
    verifiedDatasets: results.filter((r) => r.ok).length,
    failedDatasets: results.filter((r) => !r.ok).length,
    results,
  };
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function recordsToCsv(records: Array<Record<string, unknown>>): string {
  if (records.length === 0) return "";
  const columns = Array.from(
    records.reduce((cols, row) => {
      for (const key of Object.keys(row)) cols.add(key);
      return cols;
    }, new Set<string>())
  );
  const header = columns.map(escapeCsvCell).join(",");
  const rows = records.map((row) => columns.map((c) => escapeCsvCell(row[c])).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

export async function buildWorkspaceExportZip(deps?: {
  r2Client?: R2WorkerClient;
  db?: PrismaClient | null;
  ownerId?: string;
}) {
  const hydrated = await hydrateDatasetsFromCloud(deps);
  const exportedAt = new Date().toISOString();

  const entries: Array<{ filename: string; data: string }> = [
    { filename: "datasets/saved-items.json", data: JSON.stringify(hydrated.datasets.savedItems, null, 2) },
    { filename: "datasets/collections.json", data: JSON.stringify(hydrated.datasets.collections, null, 2) },
    { filename: "datasets/collection-items.json", data: JSON.stringify(hydrated.datasets.collectionItems, null, 2) },
    { filename: "datasets/saved-searches.json", data: JSON.stringify(hydrated.datasets.savedSearches, null, 2) },
    { filename: "datasets/search-history.json", data: JSON.stringify(hydrated.datasets.searchHistory, null, 2) },
    { filename: "datasets/research-notes.json", data: JSON.stringify(hydrated.datasets.researchNotes, null, 2) },
    { filename: "csv/saved-items.csv", data: recordsToCsv(hydrated.datasets.savedItems) },
    { filename: "csv/collections.csv", data: recordsToCsv(hydrated.datasets.collections) },
    { filename: "csv/saved-searches.csv", data: recordsToCsv(hydrated.datasets.savedSearches) },
    { filename: "csv/search-history.csv", data: recordsToCsv(hydrated.datasets.searchHistory) },
  ];

  const checksums: Record<string, string> = {};
  for (const e of entries) {
    checksums[e.filename] = crypto.createHash("sha256").update(e.data, "utf8").digest("hex");
  }

  entries.unshift({
    filename: "export-manifest.json",
    data: JSON.stringify(
      {
        platform: "dailymotion-discovery",
        formatVersion: "2026.1",
        exportedAt,
        source: hydrated.source,
        counts: {
          savedItems: hydrated.datasets.savedItems.length,
          collections: hydrated.datasets.collections.length,
          collectionItems: hydrated.datasets.collectionItems.length,
          savedSearches: hydrated.datasets.savedSearches.length,
          searchHistory: hydrated.datasets.searchHistory.length,
          researchNotes: hydrated.datasets.researchNotes.length,
        },
        sha256Checksums: checksums,
      },
      null,
      2
    ),
  });

  return {
    filename: `dailymotion-discovery-backup-${exportedAt.slice(0, 10)}.zip`,
    zipBuffer: createZipArchive(entries),
    exportedAt,
    source: hydrated.source,
  };
}
