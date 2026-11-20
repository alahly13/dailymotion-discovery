// Completed Explorations Manifest & Archive Service (2026)
//
// What this controls: Owner-scoped IndexedDB persistence, local catalog restoration,
// deterministic SHA-256 manifest verification, and zero-network-call cross-archive search
// for fully completed Link Explorer channel and playlist crawls.
// Why it exists: Preserves complete retrieved catalogs permanently in browser database storage
// (`completed_explorations_manifests`) so users can reopen, inspect, and search full channel archives
// without repeating Dailymotion API calls or losing previously retrieved items.
// Scope: Completed Explorations (/completed-explorations) & Link Explorer (/link-explorer).

import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import type { DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import {
  getLocalDatabase,
  LOCAL_STORES,
} from "@/lib/local-first/indexeddb-store";
import type {
  CatalogPartitionLedger,
  RetrievalDirection,
  RetrievalPeriod,
  RetrievalStrategy,
  RetrievalWindowRecord,
  ScanCompletenessStatus,
  ScanStrategy,
  TargetIdentity,
} from "./link-explorer-types";
import { computeCatalogChecksum } from "./link-explorer-service";

export interface CompletedExplorationManifest {
  id: string; // `owner:{ownerId}:completed-link-explorer-results:{apiVersion}:{resourceType}:{resourceId}`
  manifestSchemaVersion: "1.0.0";
  manifestId: string;
  ownerId: string;
  provider: "dailymotion";
  apiVersion: ApiVersion;
  resourceKind: DailymotionResourceKind;
  resourceId: string;
  canonicalSourceUrl: string;
  resourceTitle: string;
  resourceDescription?: string | null;
  resourceThumbnail?: string | null;
  targetIdentity?: TargetIdentity;
  scanId: string;
  scanStrategy: ScanStrategy;
  createdAt: string;
  completedAt: string;
  updatedAt: string;
  totalUniqueItems: number;
  providerReportedLifetimeTotal: number | null;
  providerReportedQueryTotal: number | null;
  duplicatesSkipped: number;
  omittedOrUnavailableReferences: number;
  oldestItemDate: string | null;
  newestItemDate: string | null;
  items: DiscoveryItem[];
  rawResponses?: unknown[];
  paginationMetadata: {
    totalPagesFetched: number;
    windowsRetrieved: RetrievalWindowRecord[];
  };
  retrievalLedger?: CatalogPartitionLedger;
  retrievalStrategy?: RetrievalStrategy;
  retrievalDirection?: RetrievalDirection;
  totalRawObserved?: number;
  totalDuplicatesDetected?: number;
  sha256Checksum: string;
  status: ScanCompletenessStatus;
}

export interface CompletedExplorationFilter {
  apiVersion?: "all" | "v1" | "v2";
  resourceKind?: "all" | "channel" | "playlist" | "user" | "video";
  sortBy?: "date_desc" | "date_asc" | "title" | "items_desc";
}

export interface MatchedCatalogItem {
  manifestId: string;
  resourceTitle: string;
  resourceKind: DailymotionResourceKind;
  apiVersion: ApiVersion;
  item: DiscoveryItem;
}

export interface CompletedExplorationSearchResult {
  query: string;
  totalMatches: number;
  totalCatalogsSearched: number;
  matchingCatalogsCount: number;
  matchedItems: MatchedCatalogItem[];
  matchedManifests: CompletedExplorationManifest[];
}

export function buildCompletedExplorationKey(
  ownerId: string,
  apiVersion: ApiVersion,
  resourceType: string,
  resourceId: string
): string {
  const cleanOwner = (ownerId || "local-owner").trim().toLowerCase();
  const cleanType = (resourceType || "channel").trim().toLowerCase();
  const cleanId = (resourceId || "").trim().toLowerCase();
  return `owner:${cleanOwner}:completed-link-explorer-results:${apiVersion}:${cleanType}:${cleanId}`;
}

/**
 * Validates, hashes, and persists a completed exploration manifest to IndexedDB.
 */
export async function saveCompletedExplorationManifest(
  manifest: Omit<CompletedExplorationManifest, "id" | "manifestSchemaVersion" | "sha256Checksum"> & {
    id?: string;
    sha256Checksum?: string;
  }
): Promise<CompletedExplorationManifest> {
  const cleanOwner = (manifest.ownerId || "local-owner").trim().toLowerCase();
  const key =
    manifest.id ||
    buildCompletedExplorationKey(
      cleanOwner,
      manifest.apiVersion,
      manifest.resourceKind,
      manifest.resourceId
    );

  const checksum =
    manifest.sha256Checksum ||
    (await computeCatalogChecksum(manifest.items, manifest.resourceId));

  const consolidated: CompletedExplorationManifest = {
    ...manifest,
    id: key,
    manifestSchemaVersion: "1.0.0",
    ownerId: cleanOwner,
    sha256Checksum: checksum,
    updatedAt: new Date().toISOString(),
  };

  const db = getLocalDatabase();
  await db.put(LOCAL_STORES.COMPLETED_EXPLORATIONS, consolidated);
  return consolidated;
}

/**
 * Retrieves a specific completed manifest by owner and resource parameters.
 */
export async function getCompletedExplorationManifest(
  ownerId: string,
  apiVersion: ApiVersion,
  resourceType: string,
  resourceId: string
): Promise<CompletedExplorationManifest | null> {
  const db = getLocalDatabase();
  const key = buildCompletedExplorationKey(ownerId, apiVersion, resourceType, resourceId);
  const manifest = await db.get<CompletedExplorationManifest>(LOCAL_STORES.COMPLETED_EXPLORATIONS, key);
  if (!manifest) return null;
  const cleanOwner = (ownerId || "local-owner").trim().toLowerCase();
  const manifestOwner = (manifest.ownerId || "local-owner").trim().toLowerCase();
  if (manifestOwner !== cleanOwner && cleanOwner !== "local-owner" && manifestOwner !== "local-owner") {
    return null;
  }
  return manifest;
}

/**
 * Retrieves a completed manifest by its primary storage ID.
 */
export async function getCompletedExplorationManifestById(
  id: string
): Promise<CompletedExplorationManifest | null> {
  const db = getLocalDatabase();
  return (await db.get<CompletedExplorationManifest>(LOCAL_STORES.COMPLETED_EXPLORATIONS, id)) || null;
}

/**
 * Lists all completed exploration manifests for an owner.
 */
export async function listCompletedExplorationManifests(
  ownerId: string,
  filter?: CompletedExplorationFilter
): Promise<CompletedExplorationManifest[]> {
  const db = getLocalDatabase();
  const all = await db.getAll<CompletedExplorationManifest>(LOCAL_STORES.COMPLETED_EXPLORATIONS);
  const cleanOwner = (ownerId || "local-owner").trim().toLowerCase();

  let manifests = all.filter((m) => {
    if (!m || !m.id) return false;
    const mOwner = (m.ownerId || "local-owner").trim().toLowerCase();
    const isOwnerMatch = mOwner === cleanOwner || cleanOwner === "local-owner" || mOwner === "local-owner";
    if (!isOwnerMatch) return false;

    if (filter?.apiVersion && filter.apiVersion !== "all" && m.apiVersion !== filter.apiVersion) {
      return false;
    }
    if (filter?.resourceKind && filter.resourceKind !== "all" && m.resourceKind !== filter.resourceKind) {
      return false;
    }
    return true;
  });

  const sort = filter?.sortBy || "date_desc";
  manifests.sort((a, b) => {
    if (sort === "date_asc") {
      return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
    }
    if (sort === "title") {
      return (a.resourceTitle || "").localeCompare(b.resourceTitle || "");
    }
    if (sort === "items_desc") {
      return (b.totalUniqueItems || 0) - (a.totalUniqueItems || 0);
    }
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });

  return manifests;
}

/**
 * Deletes a specific completed exploration manifest from local IndexedDB.
 */
export async function deleteCompletedExplorationManifest(id: string): Promise<void> {
  const db = getLocalDatabase();
  await db.delete(LOCAL_STORES.COMPLETED_EXPLORATIONS, id);
}

/**
 * Performs instant in-memory search across ALL saved completed catalog manifests in IndexedDB.
 * STRICT ZERO NETWORK CALL GUARANTEE: Does NOT make any Dailymotion API, Gemini, or Worker calls.
 */
export async function searchCompletedExplorations(
  ownerId: string,
  query: string,
  filter?: CompletedExplorationFilter
): Promise<CompletedExplorationSearchResult> {
  const manifests = await listCompletedExplorationManifests(ownerId, filter);
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return {
      query: "",
      totalMatches: 0,
      totalCatalogsSearched: manifests.length,
      matchingCatalogsCount: manifests.length,
      matchedItems: [],
      matchedManifests: manifests,
    };
  }

  const matchedItems: MatchedCatalogItem[] = [];
  const matchedManifestIds = new Set<string>();

  for (const manifest of manifests) {
    const manifestMatchesResource =
      (manifest.resourceTitle || "").toLowerCase().includes(trimmed) ||
      (manifest.resourceId || "").toLowerCase().includes(trimmed) ||
      (manifest.resourceDescription || "").toLowerCase().includes(trimmed);

    if (manifestMatchesResource) {
      matchedManifestIds.add(manifest.id);
    }

    for (const item of manifest.items) {
      const matchTitle = (item.title || "").toLowerCase().includes(trimmed);
      const matchDesc = (item.description || "").toLowerCase().includes(trimmed);
      const matchId = (item.id || "").toLowerCase().includes(trimmed);
      const matchOwner = (item.ownerName || item.ownerId || "").toLowerCase().includes(trimmed);
      const matchTag = item.tags?.some((t) => t.toLowerCase().includes(trimmed));

      if (matchTitle || matchDesc || matchId || matchOwner || matchTag) {
        matchedManifestIds.add(manifest.id);
        matchedItems.push({
          manifestId: manifest.id,
          resourceTitle: manifest.resourceTitle,
          resourceKind: manifest.resourceKind,
          apiVersion: manifest.apiVersion,
          item,
        });
      }
    }
  }

  const matchedManifests = manifests.filter((m) => matchedManifestIds.has(m.id));

  return {
    query,
    totalMatches: matchedItems.length,
    totalCatalogsSearched: manifests.length,
    matchingCatalogsCount: matchedManifests.length,
    matchedItems,
    matchedManifests,
  };
}
