/**
 * Explicit two-phase save receipt contract separating local durability, outbox queuing,
 * Cloudflare R2 SHA-256 verification, and PostgreSQL generation registry commit.
 */

export type SaveReceiptStage =
  | "LOCAL_SAVED"
  | "QUEUED_FOR_SYNC"
  | "R2_VERIFIED"
  | "CLOUD_COMMITTED"
  | "FAILED";

export interface SaveReceiptCounts {
  savedItems: number;
  collections: number;
  collectionItems: number;
  savedSearches: number;
  searchHistory: number;
  pendingOperationsCleared: number;
}

export interface SaveReceipt {
  batchId: string;
  idempotencyKey: string;
  stage: SaveReceiptStage;
  targetBackend: "r2-worker+postgres" | "postgres-fallback" | "local-only";
  startedAt: string;
  completedAt?: string;
  generationIds: Record<string, string>;
  aggregateSha256ByDataset?: Record<string, string>;
  counts: SaveReceiptCounts;
  verifiedByWorker: boolean;
  errorMessage?: string;
}

export function createPendingSaveReceipt(
  batchId: string,
  idempotencyKey: string,
  counts: Partial<SaveReceiptCounts> = {}
): SaveReceipt {
  return {
    batchId,
    idempotencyKey,
    stage: "QUEUED_FOR_SYNC",
    targetBackend: "local-only",
    startedAt: new Date().toISOString(),
    generationIds: {},
    counts: {
      savedItems: counts.savedItems ?? 0,
      collections: counts.collections ?? 0,
      collectionItems: counts.collectionItems ?? 0,
      savedSearches: counts.savedSearches ?? 0,
      searchHistory: counts.searchHistory ?? 0,
      pendingOperationsCleared: 0,
    },
    verifiedByWorker: false,
  };
}

export function formatSaveReceiptStageLabel(stage: SaveReceiptStage): string {
  switch (stage) {
    case "LOCAL_SAVED":
      return "Saved Locally (IndexedDB)";
    case "QUEUED_FOR_SYNC":
      return "Queued in Outbox";
    case "R2_VERIFIED":
      return "R2 Objects SHA-256 Verified";
    case "CLOUD_COMMITTED":
      return "R2 + Cloud DB Committed";
    case "FAILED":
      return "Sync Failed (Retained in Outbox)";
  }
}
