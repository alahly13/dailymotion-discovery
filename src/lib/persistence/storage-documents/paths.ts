// Storage path conventions + document envelopes for private JSON snapshots.
//
// Bucket: `application-data` (private). Layout:
//   users/admin/search-history/{v1|v2}/YYYY/MM/{batchId}.json
//   users/admin/search-snapshots/{v1|v2}/YYYY/MM/{snapshotId}.json
//   users/admin/saved-items/snapshots/{revision}.json
//   users/admin/playlists/{playlistId}/snapshots/{revision}.json
//   users/admin/manifests/{domain}/{revision}.json
// Relational rows stay authoritative for lists/order/CRUD; these objects hold
// raw snapshots/exports. The DB (storage_documents) keeps path+revision+
// checksum — reads resolve the known path, never bucket scans.
// Scope: server + scripts. Pure functions (no SDK import) for testability.

import { createHash, randomUUID } from "node:crypto";
import type { ApiVersion } from "@/lib/discovery/types";

export const STORAGE_BUCKET = "application-data";
export const STORAGE_OWNER_PREFIX = "users/admin";
export const STORAGE_SCHEMA_VERSION = "1";

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function newBatchId(): string {
  return randomUUID();
}

function ym(date: Date): { year: string; month: string } {
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
  };
}

export function searchHistoryPath(version: ApiVersion, batchId: string, when = new Date()): string {
  const { year, month } = ym(when);
  return `${STORAGE_OWNER_PREFIX}/search-history/${version}/${year}/${month}/${batchId}.json`;
}

export function searchSnapshotPath(version: ApiVersion, snapshotId: string, when = new Date()): string {
  const { year, month } = ym(when);
  return `${STORAGE_OWNER_PREFIX}/search-snapshots/${version}/${year}/${month}/${snapshotId}.json`;
}

export function savedItemsSnapshotPath(revision: string): string {
  return `${STORAGE_OWNER_PREFIX}/saved-items/snapshots/${revision}.json`;
}

export function playlistSnapshotPath(playlistId: string, revision: string): string {
  return `${STORAGE_OWNER_PREFIX}/playlists/${playlistId}/snapshots/${revision}.json`;
}

export function manifestSnapshotPath(domain: string, revision: string): string {
  return `${STORAGE_OWNER_PREFIX}/manifests/${domain}/${revision}.json`;
}

export interface StorageEnvelope<T> {
  schemaVersion: string;
  revision: string;
  createdAt: string;
  domain: string;
  apiVersion: ApiVersion | null;
  checksum: string;
  data: T;
}

/** Build a checksummed envelope (checksum covers the canonical data JSON). */
export function buildEnvelope<T>(domain: string, apiVersion: ApiVersion | null, data: T, revision = newBatchId()): { envelope: StorageEnvelope<T>; json: string; checksum: string } {
  const dataJson = JSON.stringify(data);
  const checksum = sha256Hex(dataJson);
  const envelope: StorageEnvelope<T> = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    revision,
    createdAt: new Date().toISOString(),
    domain,
    apiVersion,
    checksum,
    data,
  };
  return { envelope, json: JSON.stringify(envelope), checksum };
}

/** Verify an envelope's checksum against its embedded data. */
export function verifyEnvelope<T>(envelope: StorageEnvelope<T>): boolean {
  if (!envelope || typeof envelope !== "object") return false;
  if (envelope.schemaVersion !== STORAGE_SCHEMA_VERSION) return false;
  try {
    return sha256Hex(JSON.stringify(envelope.data)) === envelope.checksum;
  } catch {
    return false;
  }
}
