/**
 * Canonical Dailymotion API V1 & V2 Provenance Metadata (2026)
 *
 * What this controls:
 * 1. Explicit provenance stamping on every API-derived record throughout the app
 *    (API responses, normalized models, IndexedDB records, search snapshots,
 *     saved items, playlists, manifests, and JSON exports).
 * 2. Guaranteed preservation of source API version ("v1" | "v2") without guessing.
 * 3. Graceful labeling of historical records without fabricated timestamps or versions.
 * 4. Zero secret or authorization header exposure in metadata envelopes.
 *
 * Scope: Application-wide data contract.
 */

export type DailymotionApiVersion = "v1" | "v2";
export type ProvenanceApiVersion = DailymotionApiVersion | "legacy_unknown";

export interface DailymotionSourceMetadata {
  provider: "dailymotion";
  apiVersion: ProvenanceApiVersion;
  resourceType: string;
  resourceId: string;
  fetchedAt: string; // ISO 8601 UTC
  endpoint?: string;
  requestId?: string;
  schemaVersion: number;
  scanId?: string;
  dateWindowId?: string;
  page?: number;
  cursor?: string | null;
  ownerId?: string | null;
}

/**
 * Creates canonical source provenance metadata for any API-derived entity.
 */
export function createDailymotionProvenance(options: {
  apiVersion: ProvenanceApiVersion;
  resourceType: string;
  resourceId: string;
  endpoint?: string;
  requestId?: string;
  schemaVersion?: number;
  fetchedAt?: string;
  scanId?: string;
  dateWindowId?: string;
  page?: number;
  cursor?: string | null;
  ownerId?: string | null;
}): DailymotionSourceMetadata {
  return {
    provider: "dailymotion",
    apiVersion: options.apiVersion,
    resourceType: options.resourceType || "unknown",
    resourceId: options.resourceId || "",
    fetchedAt: options.fetchedAt || new Date().toISOString(),
    endpoint: options.endpoint,
    requestId: options.requestId,
    schemaVersion: options.schemaVersion ?? 1,
    scanId: options.scanId,
    dateWindowId: options.dateWindowId,
    page: options.page,
    cursor: options.cursor,
    ownerId: options.ownerId,
  };
}

/**
 * Type guard to safely check whether a payload contains valid provenance metadata.
 */
export function isDailymotionSourceMetadata(val: unknown): val is DailymotionSourceMetadata {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.provider === "dailymotion" &&
    (obj.apiVersion === "v1" || obj.apiVersion === "v2" || obj.apiVersion === "legacy_unknown") &&
    typeof obj.resourceType === "string" &&
    typeof obj.resourceId === "string" &&
    typeof obj.fetchedAt === "string"
  );
}

/**
 * Safely resolves an API version from a known input, returning "legacy_unknown"
 * if the source version cannot be reliably established from existing metadata.
 */
export function resolveProvenanceApiVersion(value: unknown): ProvenanceApiVersion {
  if (value === "v1" || value === "v2") return value;
  return "legacy_unknown";
}
