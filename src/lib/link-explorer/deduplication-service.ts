// Advanced Intelligent Deduplication & Metadata Merging Engine (2026)
//
// What this controls: Stable resource identity matching, multi-period observation tracking,
// safe non-destructive metadata merging, V1/V2 provenance isolation, duplicate origin analytics,
// and canonical unique catalog reconciliation before committing final manifests.
// Why it exists: When retrieving catalogs across adjacent months, overlapping custom date ranges,
// or retried query windows, videos can appear multiple times. Merging preserves the richest
// non-conflicting metadata and tracks provenance without duplicating final manifest records.
// Scope: Link Explorer (/link-explorer) & Completed Explorations (/completed-explorations).

import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import { discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import { computeCatalogChecksum } from "./link-explorer-service";

export interface SourceObservation {
  apiVersion: ApiVersion;
  resourceKind: string;
  resourceId: string;
  periodId?: string;
  page?: number;
  fetchedAt: string;
  rawPayload?: unknown;
}

export interface CanonicalItemTracking {
  canonicalItem: DiscoveryItem;
  compositeKey: string;
  observations: SourceObservation[];
  seenInPeriods: string[];
  seenInPages: number[];
  duplicateCount: number;
}

export interface DeduplicationSummary {
  totalRawObserved: number;
  totalUniqueRetained: number;
  totalDuplicatesDetected: number;
  duplicateOriginPeriods: Record<string, number>;
  crossVersionIdentitiesCount: number;
}

export interface ReconciledCatalogResult {
  canonicalItems: DiscoveryItem[];
  summary: DeduplicationSummary;
  oldestItemDate: string | null;
  newestItemDate: string | null;
  distributionByYear: Array<{ year: number; count: number; percentage: number }>;
  distributionByMonth: Array<{ month: string; count: number }>;
  sha256Checksum: string;
}

/**
 * Builds a stable resource identity key based on provider, resource kind, and ID.
 * Never relies on title alone, as multiple distinct videos can share identical titles.
 */
export function buildStableResourceIdentity(item: Pick<DiscoveryItem, "kind" | "id">): string {
  const cleanKind = (item.kind || "video").toLowerCase().trim();
  const cleanId = String(item.id || "").trim();
  return `${cleanKind}:${cleanId}`;
}

/**
 * Merges two discovery items non-destructively:
 * - Never overwrites an existing non-null, non-empty value with null, undefined, or empty string.
 * - Fills missing fields (description, tags, thumbnail, duration, views) from the new observation.
 * - Preserves the latest verified update timestamp.
 * - Retains higher or verified numeric counts (views, likes).
 */
export function mergeMetadata(
  existing: DiscoveryItem,
  incoming: DiscoveryItem,
  observation?: SourceObservation
): DiscoveryItem {
  const merged: DiscoveryItem = { ...existing };

  // 1. Title: preserve existing unless existing is empty
  if (!merged.title && incoming.title) {
    merged.title = incoming.title;
  }

  // 2. Description: never overwrite existing with null/empty
  if (!merged.description && incoming.description) {
    merged.description = incoming.description;
  } else if (
    incoming.description &&
    merged.description &&
    incoming.description.length > merged.description.length
  ) {
    // Prefer longer/more complete description
    merged.description = incoming.description;
  }

  // 3. Thumbnails: fill if missing
  if (!merged.thumbnail && incoming.thumbnail) {
    merged.thumbnail = incoming.thumbnail;
  }

  // 4. Durations: fill if missing
  if ((merged.duration === null || merged.duration === undefined) && incoming.duration !== null && incoming.duration !== undefined) {
    merged.duration = incoming.duration;
  }

  // 5. Views: take higher verified count
  if (incoming.views !== null && incoming.views !== undefined) {
    const existingViews = merged.views || 0;
    if (incoming.views > existingViews) {
      merged.views = incoming.views;
    }
  }

  // 6. Dates: preserve the earliest valid creation date
  if (!merged.createdAt && incoming.createdAt) {
    merged.createdAt = incoming.createdAt;
  } else if (merged.createdAt && incoming.createdAt) {
    const tExisting = new Date(merged.createdAt).getTime();
    const tIncoming = new Date(incoming.createdAt).getTime();
    if (!Number.isNaN(tIncoming) && !Number.isNaN(tExisting) && tIncoming < tExisting) {
      merged.createdAt = incoming.createdAt;
    }
  }

  // 7. Year: synchronize with createdAt
  if (merged.createdAt) {
    const yr = new Date(merged.createdAt).getUTCFullYear();
    if (!Number.isNaN(yr)) {
      merged.year = yr;
    }
  }

  // 8. Tags: merge unique tags safely
  if (incoming.tags && incoming.tags.length > 0) {
    const existingTags = new Set(merged.tags || []);
    for (const tag of incoming.tags) {
      if (tag && tag.trim()) {
        existingTags.add(tag.trim());
      }
    }
    merged.tags = Array.from(existingTags);
  }

  // 9. Extra & provenance metadata
  merged.extra = {
    ...merged.extra,
    ...incoming.extra,
  };

  // 10. Append provenance observation safely
  if (observation) {
    const prevObs = (merged.extra?.observations as SourceObservation[]) || [];
    merged.extra = {
      ...merged.extra,
      observations: [...prevObs, observation],
      lastObservedAt: observation.fetchedAt,
    };
  }

  return merged;
}

/**
 * Deduplication state manager during multi-period retrieval.
 */
export class CatalogDeduplicator {
  private itemMap = new Map<string, CanonicalItemTracking>();
  private totalRawObserved = 0;
  private totalDuplicatesDetected = 0;
  private duplicateOriginPeriods: Record<string, number> = {};

  constructor(initialItems: DiscoveryItem[] = []) {
    if (initialItems.length > 0) {
      this.ingestBatch(initialItems, "initial");
    }
  }

  /**
   * Ingests a batch of items from a specific period and page.
   * Tracks duplicates and merges metadata on collisions.
   */
  public ingestBatch(
    items: DiscoveryItem[],
    periodId: string = "unknown",
    page: number = 1
  ): { addedCount: number; duplicateCount: number } {
    let addedCount = 0;
    let duplicateCount = 0;
    const now = new Date().toISOString();

    for (const item of items) {
      this.totalRawObserved += 1;
      const identityKey = buildStableResourceIdentity(item);

      const observation: SourceObservation = {
        apiVersion: item.apiVersion,
        resourceKind: item.kind,
        resourceId: item.id,
        periodId,
        page,
        fetchedAt: now,
        rawPayload: item.raw || null,
      };

      const existingTracking = this.itemMap.get(identityKey);

      if (existingTracking) {
        // DUPLICATE DETECTED
        duplicateCount += 1;
        this.totalDuplicatesDetected += 1;
        this.duplicateOriginPeriods[periodId] = (this.duplicateOriginPeriods[periodId] || 0) + 1;

        existingTracking.duplicateCount += 1;
        if (!existingTracking.seenInPeriods.includes(periodId)) {
          existingTracking.seenInPeriods.push(periodId);
        }
        if (!existingTracking.seenInPages.includes(page)) {
          existingTracking.seenInPages.push(page);
        }
        existingTracking.observations.push(observation);

        // Merge metadata non-destructively
        existingTracking.canonicalItem = mergeMetadata(
          existingTracking.canonicalItem,
          item,
          observation
        );
      } else {
        // NEW UNIQUE ITEM
        addedCount += 1;
        const canonical: DiscoveryItem = {
          ...item,
          extra: {
            ...item.extra,
            observations: [observation],
            seenInPeriods: [periodId],
            firstObservedPeriod: periodId,
          },
        };

        this.itemMap.set(identityKey, {
          canonicalItem: canonical,
          compositeKey: discoveryCompositeKey(item.apiVersion, item.kind, item.id),
          observations: [observation],
          seenInPeriods: [periodId],
          seenInPages: [page],
          duplicateCount: 0,
        });
      }
    }

    return { addedCount, duplicateCount };
  }

  /**
   * Returns all current canonical items.
   */
  public getCanonicalItems(): DiscoveryItem[] {
    return Array.from(this.itemMap.values()).map((t) => t.canonicalItem);
  }

  /**
   * Returns deduplication statistics.
   */
  public getSummary(): DeduplicationSummary {
    let crossVersionCount = 0;
    for (const tracking of this.itemMap.values()) {
      const versions = new Set(tracking.observations.map((o) => o.apiVersion));
      if (versions.size > 1) crossVersionCount += 1;
    }

    return {
      totalRawObserved: this.totalRawObserved,
      totalUniqueRetained: this.itemMap.size,
      totalDuplicatesDetected: this.totalDuplicatesDetected,
      duplicateOriginPeriods: { ...this.duplicateOriginPeriods },
      crossVersionIdentitiesCount: crossVersionCount,
    };
  }

  /**
   * Builds the final reconciled dataset, verified checksum, and distributions.
   */
  public async reconcileFinalCatalog(resourceId: string): Promise<ReconciledCatalogResult> {
    const canonicalItems = this.getCanonicalItems();
    const summary = this.getSummary();

    // 1. Sort canonical items chronologically by createdAt (newest first for standard display)
    canonicalItems.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    // 2. Compute oldest and newest item dates
    let oldestItemDate: string | null = null;
    let newestItemDate: string | null = null;

    for (const it of canonicalItems) {
      if (it.createdAt) {
        const time = new Date(it.createdAt).getTime();
        if (!Number.isNaN(time)) {
          if (!oldestItemDate || time < new Date(oldestItemDate).getTime()) {
            oldestItemDate = it.createdAt;
          }
          if (!newestItemDate || time > new Date(newestItemDate).getTime()) {
            newestItemDate = it.createdAt;
          }
        }
      }
    }

    // 3. Compute distributions
    const yearCounts = new Map<number, number>();
    const monthCounts = new Map<string, number>();

    for (const it of canonicalItems) {
      if (it.createdAt) {
        const d = new Date(it.createdAt);
        if (!Number.isNaN(d.getTime())) {
          const yr = d.getUTCFullYear();
          yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);

          const mKey = `${yr}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          monthCounts.set(mKey, (monthCounts.get(mKey) || 0) + 1);
        }
      }
    }

    const distributionByYear = Array.from(yearCounts.entries())
      .map(([year, count]) => ({
        year,
        count,
        percentage: canonicalItems.length > 0 ? Math.round((count / canonicalItems.length) * 100) : 0,
      }))
      .sort((a, b) => b.year - a.year);

    const distributionByMonth = Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 24);

    // 4. Calculate deterministic SHA-256 checksum over the deduplicated canonical dataset
    const sha256Checksum = await computeCatalogChecksum(canonicalItems, resourceId);

    return {
      canonicalItems,
      summary,
      oldestItemDate,
      newestItemDate,
      distributionByYear,
      distributionByMonth,
      sha256Checksum,
    };
  }
}
