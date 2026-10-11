// One-click batch-save orchestrator (server-only).
//
// Sequence: admin identity in → validate batch → idempotency replay check →
// stage immutable JSON snapshot (Storage, if provided) → Prisma transaction
// (videos/saves/collections/history) → register storage pointer → record
// commit → authoritative result. Storage and SQL are NOT one atomic
// transaction: staged objects stay unreferenced on DB failure (recoverable),
// and same-key retries replay the recorded result (no duplicates).
// Scope: POST /api/cloud/batch-commit. Never expose secrets/tokens.

import { z } from "zod";
import { getPrismaClient } from "@/lib/db/prisma";
import { PersistenceUnavailableError, toPersistenceError } from "../repositories/errors";
import { getBatchCommit, recordBatchCommit, upsertStorageDocument } from "../repositories/commits";
import { appendHistory } from "../repositories/search-history";
import {
  createCollection,
  deleteCollection,
  renameCollection,
  reorderMembers,
  saveTitle,
  unsaveTitle,
} from "../repositories/saved-titles";
import {
  buildEnvelope,
  newBatchId,
  savedItemsSnapshotPath,
  type StorageEnvelope,
} from "../storage-documents/paths";
import { uploadDocument } from "../storage-documents/documents";

const titleSchema = z.object({
  platform: z.string().min(1).max(60),
  platformVideoId: z.string().min(1).max(120),
  resourceType: z.enum(["video", "channel", "playlist", "user", "live"]).default("video"),
  title: z.string().min(1).max(500),
  url: z.string().max(2000).nullish(),
  thumbnailUrl: z.string().max(2000).nullish(),
  description: z.string().max(8000).nullish(),
  durationSeconds: z.number().int().nonnegative().nullish(),
  language: z.string().max(16).nullish(),
  ownerName: z.string().max(240).nullish(),
  channelName: z.string().max(240).nullish(),
  collectionId: z.string().uuid().nullish(),
  position: z.number().int().nonnegative().nullish(),
  apiVersion: z.enum(["v1", "v2"]).nullish(),
  sourceQuery: z.string().max(2000).nullish(),
  sourcePage: z.string().max(120).nullish(),
  remove: z.boolean().default(false),
});

const collectionSchema = z.object({
  id: z.string().uuid().nullish(),
  name: z.string().min(1).max(120).nullish(),
  description: z.string().max(2000).nullish(),
  delete: z.boolean().default(false),
  reorderVideoIds: z.array(z.string().min(1).max(120)).max(2000).nullish(),
});

const historySchema = z.object({
  id: z.string().min(8).max(120),
  apiVersion: z.enum(["v1", "v2"]),
  query: z.string().min(1).max(2000),
  resource: z.string().max(40).default("general"),
  mode: z.string().max(40).default("search"),
  params: z.record(z.string(), z.unknown()).default({}),
  sort: z.string().max(60).nullish(),
  pageSize: z.number().int().positive().max(100).nullish(),
  status: z.enum(["completed", "partial", "failed"]).default("completed"),
  resultCount: z.number().int().nonnegative().nullish(),
  submittedAt: z
    .string()
    .min(1)
    .max(60)
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "submittedAt must be a valid datetime string" })
    .nullish(),
});

const batchSchema = z.object({
  idempotencyKey: z.string().min(8).max(120),
  savedTitles: z.array(titleSchema).max(1000).default([]),
  collections: z.array(collectionSchema).max(200).default([]),
  history: z.array(historySchema).max(500).default([]),
  includeSnapshot: z.boolean().default(true),
});

export type BatchPayload = z.infer<typeof batchSchema>;

export interface BatchCommitResult {
  ok: boolean;
  idempotencyKey: string;
  replayed: boolean;
  savedUpserts: number;
  historyAppended: number;
  snapshotPath: string | null;
  snapshotChecksum: string | null;
  error?: string;
  remedy?: string;
}

function invalidBatch(message: string): BatchCommitResult {
  return { ok: false, idempotencyKey: "", replayed: false, savedUpserts: 0, historyAppended: 0, snapshotPath: null, snapshotChecksum: null, error: message };
}

export async function commitBatch(raw: unknown): Promise<BatchCommitResult> {
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) return invalidBatch(`Invalid batch payload: ${parsed.error.issues[0]?.message ?? "validation failed"}.`);
  const batch = parsed.data;

  let db;
  try {
    db = getPrismaClient();
  } catch (error) {
    return { ...invalidBatch(error instanceof Error ? error.message : "Database unavailable."), idempotencyKey: batch.idempotencyKey, remedy: "Set DATABASE_URL_CONNECTION_STRING and retry — drafts stay local." };
  }

  // Idempotency first: same key → recorded result, zero duplicate work.
  try {
    const prior = await getBatchCommit(db, batch.idempotencyKey);
    if (prior && prior.status === "completed") {
      const result = (prior.resultJson as unknown as BatchCommitResult | null) ?? null;
      return { ...(result ?? { ok: true, savedUpserts: prior.savedUpserts, historyAppended: prior.historyAppended, snapshotPath: prior.snapshotPath, snapshotChecksum: prior.snapshotChecksum }), idempotencyKey: batch.idempotencyKey, replayed: true };
    }
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return { ...invalidBatch(error.message), idempotencyKey: batch.idempotencyKey, remedy: "Database unreachable — drafts stay local; retry later." };
    }
    throw error;
  }

  // Stage snapshot on an immutable revision path (a fresh revision per
  // attempt; same-key retries converge via the commit ledger, never by
  // overwriting). Storage failure fails the batch loudly — never pretend.
  let snapshotPath: string | null = null;
  let snapshotChecksum: string | null = null;
  let snapshotBytes = 0;
  if (batch.includeSnapshot && (batch.savedTitles.length > 0 || batch.history.length > 0)) {
    const revision = `batch-${batch.idempotencyKey.slice(0, 24)}-${newBatchId().slice(0, 8)}`;
    const { json, checksum } = buildEnvelope("saved-items", null, { savedTitles: batch.savedTitles, history: batch.history }, revision);
    snapshotPath = savedItemsSnapshotPath(revision);
    try {
      const uploaded = await uploadDocument(snapshotPath, json, checksum);
      snapshotChecksum = uploaded.checksum;
      snapshotBytes = uploaded.byteSize;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage snapshot failed.";
      try {
        await recordBatchCommit(db, { idempotencyKey: batch.idempotencyKey, status: "failed", error: { message } });
      } catch {
        /* ledger best-effort */
      }
      return { ...invalidBatch(message), idempotencyKey: batch.idempotencyKey, remedy: "Verify SUPABASE_SECRET_KEY + private bucket, then retry with the same key." };
    }
  }

  // Relational commit in ONE Prisma transaction (all-or-nothing for SQL).
  let savedUpserts = 0;
  let historyAppended = 0;
  try {
    await db.$transaction(async (tx) => {
      const client = tx as unknown as Parameters<typeof saveTitle>[0];
      for (const collection of batch.collections) {
        if (collection.delete && collection.id) {
          await deleteCollection(client, collection.id);
          continue;
        }
        if (collection.id) {
          if (collection.name) await renameCollection(client, collection.id, collection.name, collection.description);
          if (collection.reorderVideoIds) await reorderMembers(client, collection.id, collection.reorderVideoIds);
        } else if (collection.name) {
          await createCollection(client, collection.name, collection.description);
        }
      }
      for (const title of batch.savedTitles) {
        if (title.remove) {
          const video = await client.video.findUnique({
            where: { platform_platformVideoId: { platform: title.platform, platformVideoId: title.platformVideoId } },
          });
          if (video) await unsaveTitle(client, video.id, title.collectionId ?? null, title.apiVersion ?? undefined);
          continue;
        }
        const { created } = await saveTitle(client, {
          platform: title.platform,
          platformVideoId: title.platformVideoId,
          resourceType: title.resourceType,
          title: title.title,
          url: title.url,
          thumbnailUrl: title.thumbnailUrl,
          description: title.description,
          durationSeconds: title.durationSeconds,
          language: title.language,
          ownerName: title.ownerName,
          channelName: title.channelName,
          collectionId: title.collectionId,
          position: title.position,
          apiVersion: title.apiVersion,
          sourceQuery: title.sourceQuery,
          sourcePage: title.sourcePage,
        });
        if (created) savedUpserts += 1;
      }
      for (const entry of batch.history) {
        const { created } = await appendHistory(client, {
          id: entry.id,
          apiVersion: entry.apiVersion,
          query: entry.query,
          resource: entry.resource,
          mode: entry.mode,
          params: entry.params as Record<string, unknown>,
          sort: entry.sort,
          pageSize: entry.pageSize,
          status: entry.status,
          resultCount: entry.resultCount,
          submittedAt: entry.submittedAt ? new Date(entry.submittedAt) : undefined,
          completedAt: new Date(),
          snapshotPath,
          snapshotChecksum,
        });
        if (created) historyAppended += 1;
      }
    });
  } catch (error) {
    // DB failed AFTER a staged upload: snapshot stays unreferenced +
    // recoverable; same-key retry replays safely. Never claim success.
    const message = error instanceof Error ? error.message : "Relational commit failed.";
    try {
      await recordBatchCommit(db, { idempotencyKey: batch.idempotencyKey, status: "failed", error: { message } });
    } catch {
      /* ledger best-effort */
    }
    return { ...invalidBatch("Database commit failed; staged snapshot (if any) is unreferenced and recoverable."), idempotencyKey: batch.idempotencyKey, remedy: "Check database connectivity and retry with the SAME idempotency key." };
  }

  if (snapshotPath && snapshotChecksum) {
    try {
      await upsertStorageDocument(db, { domain: "saved-items", apiVersion: null, path: snapshotPath, revision: 1, checksum: snapshotChecksum, byteSize: snapshotBytes });
    } catch {
      /* registry best-effort; snapshot itself is verified */
    }
  }

  const result: BatchCommitResult = {
    ok: true,
    idempotencyKey: batch.idempotencyKey,
    replayed: false,
    savedUpserts,
    historyAppended,
    snapshotPath,
    snapshotChecksum,
  };
  try {
    await recordBatchCommit(db, {
      idempotencyKey: batch.idempotencyKey,
      status: "completed",
      savedUpserts,
      historyAppended,
      snapshotPath,
      snapshotChecksum,
      result: result as unknown as Record<string, unknown>,
    });
  } catch (error) {
    throw toPersistenceError(error);
  }
  return result;
}

export type { StorageEnvelope };
export { newBatchId as newIdempotencyKey };
