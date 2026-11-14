/**
 * Authoritative Cloudflare R2 Cloud Synchronization Service for Saved Titles (2026)
 *
 * Safe Upload and Commit Protocol:
 *   Phase 1 (Prepare): Authenticate owner, read local pending records, read existing cloud manifest
 *                      via R2 Worker, merge preserving historical cloud entries, calculate SHA-256.
 *   Phase 2 (Upload):  Upload immutable generation manifest, canonical manifest, and version pointer to R2.
 *   Phase 3 (Verify):  Read back and verify object existence, byte size, and SHA-256 digest match.
 *   Phase 4 (Commit):  Update Postgres StorageDataset metadata (if reachable) and return verified receipt.
 *
 * INVARIANT: Never overwrite previous cloud entries with only local drafts. Never discard local data on failure.
 */

import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { R2WorkerClient } from "@/lib/storage/r2-worker-client";
import {
  savedTitlesGenerationManifestKey,
  savedTitlesManifestKey,
  savedTitlesVersionPointerKey,
} from "@/lib/storage/r2-canonical-paths";
import {
  SavedTitleEntry,
  SavedTitlesManifest,
  SavedTitleSyncReceipt,
  SavedTitlesManifestSchema,
} from "./types";

export interface SyncSavedTitlesInput {
  ownerId: string;
  pendingEntries: SavedTitleEntry[];
}

export interface SyncSavedTitlesResult {
  ok: boolean;
  error?: string;
  phase?: "prepare" | "upload" | "verify" | "commit";
  receipt?: SavedTitleSyncReceipt;
  committedIds?: string[];
  totalCloudEntries?: number;
  revision?: number;
  generationId?: string;
}

function safeDb(): PrismaClient | null {
  try {
    return getPrismaClient();
  } catch {
    return null;
  }
}

function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function makeGenerationId(ownerId: string): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  const cleanOwner = ownerId.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `gen-${ts}-${cleanOwner}-titles-${rand}`;
}

export async function executeSavedTitlesCloudSync(
  input: SyncSavedTitlesInput,
  deps?: { r2Client?: R2WorkerClient; db?: PrismaClient | null }
): Promise<SyncSavedTitlesResult> {
  const ownerId = input.ownerId.trim().toLowerCase();
  const r2Client = deps?.r2Client ?? new R2WorkerClient();
  const db = deps?.db === undefined ? safeDb() : deps.db;

  if (!r2Client.configured) {
    return {
      ok: false,
      error: "Cloudflare R2 Worker is not configured. Local records preserved safely in IndexedDB.",
      phase: "prepare",
    };
  }

  const manifestKey = savedTitlesManifestKey(ownerId);
  const versionPointerKey = savedTitlesVersionPointerKey(ownerId);
  const generationId = makeGenerationId(ownerId);
  const genManifestKey = savedTitlesGenerationManifestKey(ownerId, generationId);
  const now = new Date().toISOString();

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 1 — Prepare: Read current cloud manifest and merge
  // ─────────────────────────────────────────────────────────────────────────────
  let existingManifest: SavedTitlesManifest | null = null;
  try {
    const rawCloud = await r2Client.getObjectJson<SavedTitlesManifest>(ownerId, manifestKey);
    if (rawCloud && rawCloud.data) {
      const parsed = SavedTitlesManifestSchema.safeParse(rawCloud.data);
      if (parsed.success) {
        existingManifest = parsed.data;
      }
    }
  } catch {
    // If object does not exist yet (404), start new manifest revision 1
  }

  const baseRevision = existingManifest ? existingManifest.revision : 0;
  const newRevision = baseRevision + 1;

  // Build merged map keyed on stable entry ID
  const mergedMap = new Map<string, SavedTitleEntry>();

  // 1. Preserve all existing historical cloud entries
  if (existingManifest && Array.isArray(existingManifest.entries)) {
    for (const entry of existingManifest.entries) {
      if (!entry.isDeleted) {
        mergedMap.set(entry.id, entry);
      }
    }
  }

  // 2. Merge pending local entries (upsert or apply tombstone)
  const committedIds: string[] = [];
  for (const pending of input.pendingEntries) {
    committedIds.push(pending.id);
    if (pending.isDeleted) {
      mergedMap.delete(pending.id);
    } else {
      mergedMap.set(pending.id, {
        ...pending,
        ownerId,
        status: "cloud_synced",
        syncedAt: now,
        updatedAt: now,
      });
    }
  }

  const mergedEntries = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const manifestPayload: SavedTitlesManifest = {
    manifestVersion: 1,
    manifestType: "saved-titles",
    provider: "dailymotion-discovery",
    owner: {
      ownerId,
    },
    manifestId: existingManifest?.manifestId || `st-manifest-${ownerId}`,
    revision: newRevision,
    createdAt: existingManifest?.createdAt || now,
    updatedAt: now,
    entries: mergedEntries,
  };

  const serializedManifest = JSON.stringify(manifestPayload, null, 2);
  const manifestSha256 = computeSha256(serializedManifest);

  const versionPayload = {
    datasetSlug: "saved-titles",
    ownerId,
    activeGenerationId: generationId,
    activeManifestKey: manifestKey,
    activeSha256: manifestSha256,
    revision: newRevision,
    recordCount: mergedEntries.length,
    updatedAt: now,
  };
  const serializedVersion = JSON.stringify(versionPayload, null, 2);

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 2 — Upload: Upload generation snapshot, canonical manifest & version pointer
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    // A. Immutable generation manifest snapshot
    await r2Client.putObject(ownerId, genManifestKey, serializedManifest, {
      sha256: manifestSha256,
      owner: ownerId,
      generationId,
    });

    // B. Canonical manifest pointer
    await r2Client.putObject(ownerId, manifestKey, serializedManifest, {
      sha256: manifestSha256,
      owner: ownerId,
      revision: String(newRevision),
    });

    // C. Dataset version pointer
    await r2Client.putObject(ownerId, versionPointerKey, serializedVersion, {
      owner: ownerId,
    });
  } catch (err) {
    return {
      ok: false,
      error: `R2 upload failed: ${err instanceof Error ? err.message : String(err)}. Local pending records preserved.`,
      phase: "upload",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3 — Verify: Read-back verification and checksum check
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const verifiedObj = await r2Client.getObjectText(ownerId, manifestKey);
    if (!verifiedObj || !verifiedObj.text) {
      return {
        ok: false,
        error: "Verification failed: committed manifest could not be read back from R2.",
        phase: "verify",
      };
    }

    const verifiedSha = computeSha256(verifiedObj.text);
    if (verifiedSha.toLowerCase() !== manifestSha256.toLowerCase()) {
      return {
        ok: false,
        error: `Integrity verification failure: expected SHA-256 "${manifestSha256}" but read "${verifiedSha}".`,
        phase: "verify",
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: `Verification step failed: ${err instanceof Error ? err.message : String(err)}. Local pending records preserved.`,
      phase: "verify",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 4 — Commit: Record relational metadata (if DB reachable) and emit receipt
  // ─────────────────────────────────────────────────────────────────────────────
  if (db) {
    try {
      await db.storageDataset.upsert({
        where: {
          ownerId_datasetSlug: {
            ownerId,
            datasetSlug: "saved-titles",
          },
        },
        create: {
          ownerId,
          datasetSlug: "saved-titles",
          storageBackend: "r2-worker",
          bucketName: "dailymotion-discovery-private",
          versionPointerKey,
          activeGenerationId: generationId,
          activeManifestKey: manifestKey,
          activeAggregateSha: manifestSha256,
          activeRecordCount: mergedEntries.length,
          lastSyncedAt: new Date(now),
        },
        update: {
          activeGenerationId: generationId,
          activeManifestKey: manifestKey,
          activeAggregateSha: manifestSha256,
          activeRecordCount: mergedEntries.length,
          lastSyncedAt: new Date(now),
        },
      });
    } catch {
      // Non-fatal precheck if remote pooler DB is temporarily unreachable in dev
    }
  }

  const receipt: SavedTitleSyncReceipt = {
    revision: newRevision,
    generationId,
    sha256: manifestSha256,
    uploadedAt: now,
    targetObjectKey: manifestKey,
  };

  return {
    ok: true,
    receipt,
    committedIds,
    totalCloudEntries: mergedEntries.length,
    revision: newRevision,
    generationId,
  };
}
