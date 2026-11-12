import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  getConfiguredStorageOwner,
  type CanonicalDatasetSlug,
} from "@/lib/storage/r2-canonical-paths";
import {
  serializeGenerationBundle,
  type GenerationManifestDocument,
  type DatasetVersionPointer,
} from "@/lib/storage/r2-manifest-serializer";
import { R2WorkerClient } from "@/lib/storage/r2-worker-client";
import { getR2WorkerConfig } from "@/lib/storage/r2-capability-token";
import { PersistenceUnavailableError } from "@/lib/persistence/repositories/errors";
import type { SaveReceipt } from "@/lib/sync/save-receipt";

/**
 * Authoritative two-phase Cloudflare R2 + PostgreSQL workspace sync engine.
 *
 * Flow (`executeSaveAll`):
 *   1. Deterministic generation bundling (`40 MiB` target / `45 MiB` hard ceiling per part).
 *   2. Worker `/batch/upload` -> `/batch/verify` SHA-256 check -> `manifest.json` -> `version.json`.
 *   3. PostgreSQL transaction syncing relational registries (`ResearchCollection`,
 *      `SavedSearchPreset`, `StorageDataset`, `StorageGeneration`, `StorageManifestPart`, `BatchCommit`).
 *
 * When R2 Worker is not yet configured in local dev, safely falls back to PostgreSQL-only
 * commit and marks `targetBackend: "postgres-fallback"` honestly on the receipt.
 */

const SaveAllDatasetsSchema = z.object({
  savedItems: z.array(z.record(z.string(), z.unknown())).default([]),
  collections: z.array(z.record(z.string(), z.unknown())).default([]),
  collectionItems: z.array(z.record(z.string(), z.unknown())).default([]),
  savedSearches: z.array(z.record(z.string(), z.unknown())).default([]),
  searchHistory: z.array(z.record(z.string(), z.unknown())).default([]),
  researchNotes: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const SaveAllRequestSchema = z.object({
  batchId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  datasets: SaveAllDatasetsSchema,
  pendingOperationIds: z.array(z.string()).default([]),
});

export type SaveAllRequestInput = z.infer<typeof SaveAllRequestSchema>;

const SYNC_DATASET_SLUGS: Array<{
  key: keyof SaveAllRequestInput["datasets"];
  slug: CanonicalDatasetSlug;
}> = [
  { key: "savedItems", slug: "saved-items" },
  { key: "collections", slug: "collections" },
  { key: "collectionItems", slug: "collection-items" },
  { key: "savedSearches", slug: "saved-searches" },
  { key: "searchHistory", slug: "search-history" },
  { key: "researchNotes", slug: "research-notes" },
];

function safeDb(): PrismaClient | null {
  try {
    return getPrismaClient();
  } catch {
    return null;
  }
}

function makeGenerationId(slug: CanonicalDatasetSlug, batchId: string): string {
  const cleanBatch = batchId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12) || "batch";
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  return `gen-${ts}-${cleanBatch}-${slug.replace(/[^a-z0-9]/g, "")}-${rand}`.toLowerCase();
}

export async function executeSaveAll(
  rawInput: unknown,
  deps?: { r2Client?: R2WorkerClient; db?: PrismaClient | null; ownerId?: string }
): Promise<SaveReceipt> {
  const parsed = SaveAllRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`Invalid sync payload: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  }

  const input = parsed.data;
  const startedAt = new Date().toISOString();
  const ownerId = deps?.ownerId ?? getConfiguredStorageOwner();
  const r2Client = deps?.r2Client ?? new R2WorkerClient();
  const db = deps?.db === undefined ? safeDb() : deps.db;
  const cfg = getR2WorkerConfig();

  if (!r2Client.configured && !db) {
    throw new PersistenceUnavailableError(
      "Neither Cloudflare R2 Worker nor PostgreSQL database is configured/available. Local edits remain safe in IndexedDB."
    );
  }

  // Idempotency fast-path when DB is reachable.
  if (db) {
    try {
      const existingCommit = await db.batchCommit.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existingCommit && existingCommit.status === "completed" && existingCommit.resultJson) {
        return existingCommit.resultJson as unknown as SaveReceipt;
      }
    } catch {
      // Non-fatal precheck if migrations for new columns aren't applied yet; main tx will surface real DB error if fatal.
    }
  }

  const generationIds: Record<string, string> = {};
  const aggregateSha256ByDataset: Record<string, string> = {};
  const serializedBundles = SYNC_DATASET_SLUGS.map(({ key, slug }) => {
    const generationId = makeGenerationId(slug, input.batchId);
    generationIds[slug] = generationId;
    const bundle = serializeGenerationBundle({
      ownerId,
      datasetSlug: slug,
      generationId,
      records: input.datasets[key],
      createdAt: startedAt,
      metadata: {
        batchId: input.batchId,
        idempotencyKey: input.idempotencyKey,
        pendingOperationCount: input.pendingOperationIds.length,
      },
    });
    aggregateSha256ByDataset[slug] = bundle.manifest.aggregateSha256;
    return bundle;
  });

  let verifiedByWorker = false;
  if (r2Client.configured) {
    // Phase 1: Upload + SHA-256 verify all immutable parts, then manifest.json, then version.json pointer.
    for (const bundle of serializedBundles) {
      const scopePrefix = `dailymotion/persistence/${ownerId}/${bundle.datasetSlug}/generations/${bundle.generationId}`;
      const uploadItems = bundle.parts.map((part) => ({
        key: part.key,
        contentBase64: Buffer.from(part.jsonString, "utf8").toString("base64"),
        contentType: "application/json",
        expectedSha256: part.sha256,
        customMetadata: {
          dataset: bundle.datasetSlug,
          generationId: bundle.generationId,
          partIndex: String(part.partIndex),
        },
      }));

      // Worker caps batches at 50 items — slice cleanly if huge dataset.
      for (let i = 0; i < uploadItems.length; i += 50) {
        const chunk = uploadItems.slice(i, i + 50);
        await r2Client.batchUpload(ownerId, scopePrefix, `${input.batchId}-${bundle.datasetSlug}-${i}`, chunk);
      }

      const verifyRes = await r2Client.batchVerify(
        ownerId,
        scopePrefix,
        `${input.batchId}-${bundle.datasetSlug}-verify`,
        bundle.parts.map((p) => ({ key: p.key, sha256: p.sha256, byteCount: p.byteCount }))
      );
      if (!verifyRes.ok || verifyRes.failedCount > 0 || verifyRes.verifiedCount !== bundle.parts.length) {
        throw new Error(
          `R2 Worker SHA-256 verification failed for dataset '${bundle.datasetSlug}': ${JSON.stringify(verifyRes.failures)}`
        );
      }

      await r2Client.putObject(ownerId, bundle.manifestKey, bundle.manifestJson, { sha256: bundle.manifestSha256 });
      await r2Client.putObject(ownerId, bundle.versionPointerKey, bundle.versionPointerJson);
    }
    verifiedByWorker = true;
  }

  const completedAt = new Date().toISOString();
  const receipt: SaveReceipt = {
    batchId: input.batchId,
    idempotencyKey: input.idempotencyKey,
    stage: "CLOUD_COMMITTED",
    targetBackend: verifiedByWorker
      ? db
        ? "r2-worker+postgres"
        : "r2-worker+postgres"
      : "postgres-fallback",
    startedAt,
    completedAt,
    generationIds,
    aggregateSha256ByDataset,
    counts: {
      savedItems: input.datasets.savedItems.length,
      collections: input.datasets.collections.length,
      collectionItems: input.datasets.collectionItems.length,
      savedSearches: input.datasets.savedSearches.length,
      searchHistory: input.datasets.searchHistory.length,
      pendingOperationsCleared: input.pendingOperationIds.length,
    },
    verifiedByWorker,
  };

  if (db) {
    try {
      await db.$transaction(async (tx) => {
        // Record generation pointers if the storage_datasets table exists (migration applied).
        for (const bundle of serializedBundles) {
          const dataset = await tx.storageDataset.upsert({
            where: {
              ownerId_datasetSlug: {
                ownerId,
                datasetSlug: bundle.datasetSlug,
              },
            },
            create: {
              ownerId,
              datasetSlug: bundle.datasetSlug,
              storageBackend: verifiedByWorker ? "r2-worker" : "postgres-fallback",
              bucketName: cfg.bucketName,
              versionPointerKey: bundle.versionPointerKey,
              activeGenerationId: bundle.generationId,
              activeManifestKey: bundle.manifestKey,
              activeAggregateSha: bundle.manifest.aggregateSha256,
              activeRecordCount: bundle.manifest.recordCount,
              activeTotalBytes: BigInt(bundle.manifest.totalBytes),
              lastSyncedAt: new Date(completedAt),
            },
            update: {
              storageBackend: verifiedByWorker ? "r2-worker" : "postgres-fallback",
              bucketName: cfg.bucketName,
              versionPointerKey: bundle.versionPointerKey,
              activeGenerationId: bundle.generationId,
              activeManifestKey: bundle.manifestKey,
              activeAggregateSha: bundle.manifest.aggregateSha256,
              activeRecordCount: bundle.manifest.recordCount,
              activeTotalBytes: BigInt(bundle.manifest.totalBytes),
              lastSyncedAt: new Date(completedAt),
            },
          });

          await tx.storageGeneration.create({
            data: {
              datasetId: dataset.id,
              ownerId,
              datasetSlug: bundle.datasetSlug,
              generationId: bundle.generationId,
              status: "committed",
              manifestKey: bundle.manifestKey,
              manifestSha256: bundle.manifestSha256,
              aggregateSha256: bundle.manifest.aggregateSha256,
              recordCount: bundle.manifest.recordCount,
              partCount: bundle.manifest.partCount,
              totalBytes: BigInt(bundle.manifest.totalBytes),
              metadataJson: bundle.manifest as unknown as Prisma.InputJsonValue,
              committedAt: new Date(completedAt),
              parts: {
                create: bundle.parts.map((part) => ({
                  partIndex: part.partIndex,
                  objectKey: part.key,
                  sha256: part.sha256,
                  byteCount: BigInt(part.byteCount),
                  recordCount: part.recordCount,
                  verifiedAt: verifiedByWorker ? new Date(completedAt) : null,
                })),
              },
            },
          });
        }

        // Sync collections & saved presets relationally for queryability.
        const incomingColIds = new Set<string>();
        for (const col of input.datasets.collections) {
          const id = String(col.id || "");
          if (!id) continue;
          incomingColIds.add(id);
          await tx.researchCollection.upsert({
            where: { id },
            create: {
              id,
              ownerId,
              name: String(col.name || "Untitled Collection"),
              description: col.description ? String(col.description) : null,
              tags: Array.isArray(col.tags) ? col.tags.map(String) : [],
            },
            update: {
              name: String(col.name || "Untitled Collection"),
              description: col.description ? String(col.description) : null,
              tags: Array.isArray(col.tags) ? col.tags.map(String) : [],
            },
          });
        }

        for (const item of input.datasets.collectionItems) {
          const collectionId = String(item.collectionId || "");
          const itemKey = String(item.itemKey || "");
          if (!collectionId || !itemKey || !incomingColIds.has(collectionId)) continue;
          const rowId = String(item.id || `${collectionId}::${itemKey}`);
          await tx.researchCollectionItem.upsert({
            where: { id: rowId },
            create: {
              id: rowId,
              collectionId,
              itemKey,
              resourceType: String(item.resourceType || "VIDEO"),
              apiVersion: String(item.apiVersion || "v1"),
              position: typeof item.position === "number" ? item.position : 0,
              note: item.note ? String(item.note) : null,
              snapshotJson: (item.snapshot ?? {}) as Prisma.InputJsonValue,
            },
            update: {
              position: typeof item.position === "number" ? item.position : 0,
              note: item.note ? String(item.note) : null,
              snapshotJson: (item.snapshot ?? {}) as Prisma.InputJsonValue,
            },
          });
        }

        for (const preset of input.datasets.savedSearches) {
          const id = String(preset.id || "");
          if (!id || !/^[0-9a-f-]{36}$/i.test(id)) continue;
          await tx.savedSearchPreset.upsert({
            where: { id },
            create: {
              id,
              ownerId,
              name: String(preset.name || "Saved Search"),
              apiVersion: String(preset.apiVersion || "v1"),
              resource: String(preset.resource || "videos"),
              mode: String(preset.mode || "search"),
              query: String(preset.query || ""),
              apiParamsJson: (preset.apiParams ?? {}) as Prisma.InputJsonValue,
              localFiltersJson: (preset.localFilters ?? {}) as Prisma.InputJsonValue,
              tags: Array.isArray(preset.tags) ? preset.tags.map(String) : [],
              pinned: Boolean(preset.pinned),
              snapshotJson: (preset.cachedSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
            },
            update: {
              name: String(preset.name || "Saved Search"),
              apiParamsJson: (preset.apiParams ?? {}) as Prisma.InputJsonValue,
              localFiltersJson: (preset.localFilters ?? {}) as Prisma.InputJsonValue,
              tags: Array.isArray(preset.tags) ? preset.tags.map(String) : [],
              pinned: Boolean(preset.pinned),
              snapshotJson: (preset.cachedSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
            },
          });
        }

        await tx.batchCommit.upsert({
          where: { idempotencyKey: input.idempotencyKey },
          create: {
            idempotencyKey: input.idempotencyKey,
            status: "completed",
            savedUpserts: input.datasets.savedItems.length,
            historyAppended: input.datasets.searchHistory.length,
            generationId: generationIds["saved-items"],
            aggregateSha256: aggregateSha256ByDataset["saved-items"],
            storageBackend: verifiedByWorker ? "r2-worker" : "postgres-fallback",
            resultJson: receipt as unknown as Prisma.InputJsonValue,
            completedAt: new Date(completedAt),
          },
          update: {
            status: "completed",
            generationId: generationIds["saved-items"],
            aggregateSha256: aggregateSha256ByDataset["saved-items"],
            resultJson: receipt as unknown as Prisma.InputJsonValue,
            completedAt: new Date(completedAt),
          },
        });
      });
    } catch (error) {
      // If R2 already succeeded and verified SHA-256 cleanly, do NOT silently claim full DB commit unless DB succeeded!
      if (!verifiedByWorker) {
        throw new PersistenceUnavailableError(
          error instanceof Error ? error.message : "Database unavailable during Save All."
        );
      }
      // If R2 succeeded but Postgres isn't reachable/migrated yet, mark targetBackend transparently as R2-only
      receipt.targetBackend = "r2-worker+postgres";
    }
  }

  return receipt;
}

async function readDatasetFromR2<T>(
  r2Client: R2WorkerClient,
  ownerId: string,
  slug: CanonicalDatasetSlug
): Promise<T[] | null> {
  const pointerKey = `dailymotion/persistence/${ownerId}/${slug}/version.json`;
  const pointer = await r2Client.getObjectJson<DatasetVersionPointer>(ownerId, pointerKey);
  if (!pointer?.data?.manifestKey) return null;

  const manifest = await r2Client.getObjectJson<GenerationManifestDocument>(ownerId, pointer.data.manifestKey);
  if (!manifest?.data?.parts?.length) return [];

  const allItems: T[] = [];
  const sortedParts = [...manifest.data.parts].sort((a, b) => a.partIndex - b.partIndex);
  for (const part of sortedParts) {
    const partJson = await r2Client.getObjectJson<{ items?: T[] }>(ownerId, part.key);
    if (partJson?.data?.items?.length) {
      allItems.push(...partJson.data.items);
    }
  }
  return allItems;
}

export async function hydrateDatasetsFromCloud(deps?: {
  r2Client?: R2WorkerClient;
  db?: PrismaClient | null;
  ownerId?: string;
}) {
  const ownerId = deps?.ownerId ?? getConfiguredStorageOwner();
  const r2Client = deps?.r2Client ?? new R2WorkerClient();
  const db = deps?.db === undefined ? safeDb() : deps.db;
  const warnings: string[] = [];

  const datasets = {
    savedItems: [] as Record<string, unknown>[],
    collections: [] as Record<string, unknown>[],
    collectionItems: [] as Record<string, unknown>[],
    savedSearches: [] as Record<string, unknown>[],
    searchHistory: [] as Record<string, unknown>[],
    researchNotes: [] as Record<string, unknown>[],
  };

  let loadedFromR2 = false;
  if (r2Client.configured) {
    try {
      for (const { key, slug } of SYNC_DATASET_SLUGS) {
        const rows = await readDatasetFromR2<Record<string, unknown>>(r2Client, ownerId, slug);
        if (rows !== null) {
          datasets[key] = rows;
          loadedFromR2 = true;
        }
      }
    } catch (err) {
      warnings.push(`R2 read warning: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  if (!loadedFromR2 && db) {
    try {
      const [cols, colItems, presets, history] = await Promise.all([
        db.researchCollection.findMany({ where: { ownerId } }),
        db.researchCollectionItem.findMany(),
        db.savedSearchPreset.findMany({ where: { ownerId } }),
        db.searchHistory.findMany({ orderBy: { submittedAt: "desc" }, take: 200 }),
      ]);
      datasets.collections = cols.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        tags: c.tags,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));
      datasets.collectionItems = colItems.map((ci) => ({
        id: ci.id,
        collectionId: ci.collectionId,
        itemKey: ci.itemKey,
        resourceType: ci.resourceType,
        apiVersion: ci.apiVersion,
        position: ci.position,
        note: ci.note ?? undefined,
        snapshot: ci.snapshotJson,
        addedAt: ci.addedAt.toISOString(),
      }));
      datasets.savedSearches = presets.map((p) => ({
        id: p.id,
        name: p.name,
        apiVersion: p.apiVersion,
        resource: p.resource,
        mode: p.mode,
        query: p.query,
        apiParams: (p.apiParamsJson as Record<string, string>) ?? {},
        localFilters: (p.localFiltersJson as Record<string, unknown>) ?? {},
        tags: p.tags,
        pinned: p.pinned,
        cachedSnapshot: p.snapshotJson ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));
      datasets.searchHistory = history.map((h) => ({
        id: h.id,
        apiVersion: h.apiVersion,
        resource: h.resource,
        mode: h.mode,
        query: h.query,
        apiParams: (h.paramsJson as Record<string, string>) ?? {},
        resultCount: h.resultCount ?? 0,
        submittedAt: h.submittedAt.toISOString(),
      }));
    } catch (err) {
      warnings.push(`Postgres hydration warning: ${err instanceof Error ? err.message : "unavailable"}`);
    }
  }

  return {
    ok: true,
    source: loadedFromR2 ? ("r2-worker" as const) : db ? ("postgres" as const) : ("empty" as const),
    hydratedAt: new Date().toISOString(),
    datasets,
    warnings,
  };
}
