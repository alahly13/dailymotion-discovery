// Link Explorer Types & Intelligence Schema (2026)
//
// What this controls: Type definitions for the Advanced Dailymotion Resource Explorer &
// Channel Intelligence Workspace, including scan strategies, multi-page catalog progress,
// resource intelligence analysis, date-window partitioning diagnostics, and exportable manifest structures.
// Scope: Link Explorer (/link-explorer).

import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import type { DailymotionAnalyzedLink, DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import type { DailymotionNormalizedError } from "@/lib/dailymotion/errors";

export type ScanStrategy = "quick" | "standard" | "deep" | "resume" | "custom";

export type ScanCompletenessStatus =
  | "not_started"
  | "in_progress"
  | "discovering"
  | "fetching_pages"
  | "splitting_date_ranges"
  | "paused"
  | "interrupted"
  | "standard_scan_completed"
  | "more_results_available"
  | "partial"
  | "capped_window"
  | "date_partitioning_required"
  | "completed_with_known_limitations"
  | "complete_within_verified_scope"
  | "coverage_unknown"
  | "completed"
  | "failed";

export type FieldSelectionProfile = "basic" | "standard" | "extended" | "custom";

export interface ScanBudgetConfig {
  strategy: ScanStrategy;
  pageSize: number; // 25, 50, 100
  maxPages: number; // 1, 2, 5, 10, 50, 0 (unlimited)
  throttleMs: number; // 0, 150, 300, 500, 1000
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  fieldsProfile: FieldSelectionProfile;
  customFields?: string;
  serverSort?: string; // v1: recent, old, visited, trending | v2: created_at, -created_at
}

export interface VideoChronologyRef {
  id: string;
  title: string;
  thumbnail: string | null;
  date: string | null;
  duration: number | null;
  url: string | null;
}

export interface TargetIdentity {
  rawInput: string;
  canonicalUrl: string | null;
  legacyUserId: string | null;
  legacyUsername: string | null;
  v2ProfileId: string | null;
  resolvedKind: DailymotionResourceKind;
  selectedApiVersion: ApiVersion;
  isAmbiguous?: boolean;
  ambiguityReason?: string | null;
}

export interface RetrievalWindowRecord {
  windowId: string;
  label: string;
  dateFrom: string | null;
  dateTo: string | null;
  pageCount: number;
  uniqueCount: number;
  duplicateCount: number;
  providerTotal: number | null;
  isCapped: boolean;
  status: "completed" | "capped" | "unresolved" | "failed";
  error?: string | null;
}

export interface RetrievalDiagnostics {
  scanId: string;
  scanStrategy: ScanStrategy;
  startedAt: string;
  completedAt: string | null;
  initialQueryTotal: number | null;
  lifetimeReportedTotal: number | null;
  windows: RetrievalWindowRecord[];
  activeWindowDepth: number;
  rateLimitHits: number;
  hasUnresolvedWindows: boolean;
  notes: string[];
}

export interface CatalogRetrievalMetrics {
  providerReportedTotalPerQuery: number | null;
  providerReportedTotalLifetime: number | null;
  pagesFetched: number;
  uniqueRecordsFetched: number;
  duplicateRecordsSkipped: number;
  uniqueRecordsPersisted: number;
  dateWindowsCompleted: number;
  dateWindowsRemaining: number;
  failedRequests: number;
  unresolvedWindows: number;
  recordsUnavailableOrInaccessible: number;
  coverageStatus: ScanCompletenessStatus;
  coverageEvidence: string;
}

export interface ResourceIntelligenceData {
  profile: {
    name: string;
    id: string;
    handle: string | null;
    canonicalUrl: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    description: string | null;
    country: string | null;
    language: string | null;
    createdDate: string | null;
    verified: boolean;
    apiVersion: ApiVersion;
    retrievedAt: string;
    catalogStatus: ScanCompletenessStatus;
    targetIdentity?: TargetIdentity;
  };
  statistics: {
    providerReportedVideos: number | null;
    providerReportedQueryTotal: number | null;
    providerReportedPlaylists: number | null;
    providerReportedLivestreams: number | null;
    locallyRetrievedVideos: number;
    locallyRetrievedPlaylists: number;
    locallyRetrievedLivestreams: number;
    totalRetrieved: number;
    isEstimated: boolean;
    isGlobalTotalUnknown: boolean;
    coveragePercent: number | null;
    coverageStatus: ScanCompletenessStatus;
    coverageEvidence: string;
    omittedOrUnavailableReferences?: number;
    duplicatesSkipped?: number;
    pagesRetrieved?: number;
    pagesRemaining?: number | null;
  };
  chronology: {
    earliestPublicationDate: string | null;
    earliestCreationDate: string | null;
    oldestVideo: VideoChronologyRef | null;
    newestVideo: VideoChronologyRef | null;
    isRecentlyActive: boolean;
    lastActivityRelative: string | null;
  };
  distribution: {
    byYear: Array<{ year: number; count: number; percentage: number }>;
    byMonth: Array<{ month: string; count: number }>;
    byResourceType: Record<string, number>;
  };
  diagnostics?: RetrievalDiagnostics;
  metrics?: CatalogRetrievalMetrics;
}

export interface ScanProgressState {
  status: ScanCompletenessStatus;
  strategy: ScanStrategy;
  pagesFetched: number;
  totalPagesEstimated: number | null;
  itemsDiscovered: number;
  uniqueItemsAdded: number;
  duplicateCount: number;
  activeWindowLabel: string | null;
  activeWindowDepth: number;
  currentRateThrottleMs: number;
  error: string | null;
  canResume: boolean;
  windowsCompleted?: number;
  windowsTotal?: number;
}

export interface LinkExplorerManifest {
  manifestId: string;
  manifestRevision: number;
  sourceInput: string;
  identifier: string;
  targetIdentity: TargetIdentity;
  resourceKind: DailymotionResourceKind;
  apiVersion: ApiVersion;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  sha256Checksum: string;
  intelligence: ResourceIntelligenceData | null;
  metrics: CatalogRetrievalMetrics;
  diagnostics: RetrievalDiagnostics;
  items: DiscoveryItem[];
  scanConfig: ScanBudgetConfig;
  status: ScanCompletenessStatus;
}

export interface ContinuationState {
  startPage: number;
  nextCursor?: string | null;
  existingItems?: DiscoveryItem[];
  existingDuplicates?: number;
  visitedPages?: number[];
  visitedCursors?: string[];
  providerReportedTotal?: number | null;
  providerReportedLifetimeTotal?: number | null;
  omittedOrUnavailableReferences?: number;
  diagnostics?: RetrievalDiagnostics;
  targetIdentity?: TargetIdentity;
  dateBefore?: string | null;
  dateAfter?: string | null;
  dateWindowLabel?: string | null;
}

export interface LinkExplorerResolution {
  ok: boolean;
  analyzed: DailymotionAnalyzedLink;
  targetIdentity?: TargetIdentity;
  effectiveKind: DailymotionResourceKind;
  version: ApiVersion;
  item: DiscoveryItem | null;
  items: DiscoveryItem[];
  relatedItems?: DiscoveryItem[];
  hasMore?: boolean;
  hasRemainingCatalog?: boolean;
  page?: number;
  total?: number;
  lifetimeTotal?: number | null;
  nextCursor?: string | null;
  omittedOrUnavailableReferences?: number;
  duplicatesSkipped?: number;
  error?: string;
  reason?: string;
  status?: number | null;
  normalized?: DailymotionNormalizedError;
  intelligence?: ResourceIntelligenceData | null;
  scanProgress?: ScanProgressState | null;
  manifest?: LinkExplorerManifest | null;
  diagnostics?: RetrievalDiagnostics;
  metrics?: CatalogRetrievalMetrics;
  checkpoint?: {
    nextPage: number;
    nextCursor: string | null;
    visitedPages: number[];
    visitedCursors: string[];
    canResume: boolean;
  };
}

/**
 * Computes deep resource intelligence from catalog items and profile metadata.
 */
export function computeResourceIntelligence(
  items: DiscoveryItem[],
  mainItem: DiscoveryItem | null,
  version: ApiVersion,
  analyzed: DailymotionAnalyzedLink,
  catalogStatus: ScanCompletenessStatus = "completed",
  extraStats?: {
    duplicatesSkipped?: number;
    pagesRetrieved?: number;
    pagesRemaining?: number | null;
    providerReportedTotal?: number | null;
    providerReportedLifetimeTotal?: number | null;
    omittedOrUnavailable?: number;
    coverageStatus?: ScanCompletenessStatus;
    coverageEvidence?: string;
    targetIdentity?: TargetIdentity;
    diagnostics?: RetrievalDiagnostics;
    metrics?: CatalogRetrievalMetrics;
  }
): ResourceIntelligenceData {
  const profileName = mainItem?.title || analyzed.displayLabel || analyzed.identifier;
  const profileId = mainItem?.id || analyzed.identifier;
  const profileHandle = mainItem?.ownerName || (analyzed.identifier.startsWith("@") ? analyzed.identifier : null);
  const canonicalUrl = mainItem?.url || analyzed.canonicalUrl || `https://www.dailymotion.com/${profileId}`;
  const avatarUrl = mainItem?.thumbnail || null;
  const description = mainItem?.description || null;
  const country = mainItem?.country || null;
  const language = mainItem?.language || null;
  const createdDate = mainItem?.createdAt || null;
  const verified = Boolean(mainItem?.extra?.verified);

  // 1. Resolve lifetime total from profile metadata or extraStats
  let providerReportedLifetime: number | null = null;
  if (extraStats?.providerReportedLifetimeTotal !== undefined && extraStats.providerReportedLifetimeTotal !== null) {
    providerReportedLifetime = extraStats.providerReportedLifetimeTotal;
  } else if (extraStats?.providerReportedTotal === undefined || extraStats.providerReportedTotal === null) {
    if (mainItem?.extra?.videosTotal !== undefined && mainItem.extra.videosTotal !== null) {
      const parsed = Number(mainItem.extra.videosTotal);
      if (!Number.isNaN(parsed)) providerReportedLifetime = parsed;
    } else if (mainItem?.extra?.videos_total !== undefined && mainItem.extra.videos_total !== null) {
      const parsed = Number(mainItem.extra.videos_total);
      if (!Number.isNaN(parsed)) providerReportedLifetime = parsed;
    }
  }

  // 2. Query-level total
  let providerReportedQueryTotal: number | null = null;
  if (extraStats?.providerReportedTotal !== undefined && extraStats.providerReportedTotal !== null) {
    providerReportedQueryTotal = extraStats.providerReportedTotal;
  }

  // Count locally retrieved by kind
  let locallyRetrievedVideos = 0;
  let locallyRetrievedPlaylists = 0;
  let locallyRetrievedLivestreams = 0;
  const typeCounts: Record<string, number> = {};

  // For chronological analysis
  const validDatedVideos: Array<{ item: DiscoveryItem; timestamp: number }> = [];

  for (const it of items) {
    const k = it.kind || "video";
    typeCounts[k] = (typeCounts[k] || 0) + 1;
    if (k === "video") locallyRetrievedVideos += 1;
    else if (k === "playlist") locallyRetrievedPlaylists += 1;
    else if (k === "live") locallyRetrievedLivestreams += 1;

    if (it.createdAt) {
      const parsed = new Date(it.createdAt).getTime();
      if (!Number.isNaN(parsed)) {
        validDatedVideos.push({ item: it, timestamp: parsed });
      }
    }
  }

  // Sort chronological
  validDatedVideos.sort((a, b) => a.timestamp - b.timestamp);

  const oldest = validDatedVideos[0]?.item || null;
  const newest = validDatedVideos[validDatedVideos.length - 1]?.item || null;

  const oldestVideoRef: VideoChronologyRef | null = oldest
    ? {
        id: oldest.id,
        title: oldest.title,
        thumbnail: oldest.thumbnail,
        date: oldest.createdAt,
        duration: oldest.duration,
        url: oldest.url || `https://www.dailymotion.com/video/${oldest.id}`,
      }
    : null;

  const newestVideoRef: VideoChronologyRef | null = newest
    ? {
        id: newest.id,
        title: newest.title,
        thumbnail: newest.thumbnail,
        date: newest.createdAt,
        duration: newest.duration,
        url: newest.url || `https://www.dailymotion.com/video/${newest.id}`,
      }
    : null;

  const totalRetrieved = items.length;
  const providerReportedVideos = providerReportedLifetime ?? providerReportedQueryTotal ?? null;
  const isEstimated = providerReportedVideos !== null && providerReportedVideos > 1000;
  const isGlobalTotalUnknown = providerReportedLifetime === null;

  // Accurate coverage calculation (no false 100%)
  let coveragePercent: number | null = null;
  let coverageStatus: ScanCompletenessStatus = extraStats?.coverageStatus ?? catalogStatus;
  let coverageEvidence = extraStats?.coverageEvidence || "";

  if (providerReportedLifetime && providerReportedLifetime > 0) {
    coveragePercent = Math.min(100, Math.round((totalRetrieved / providerReportedLifetime) * 1000) / 10);
    if (totalRetrieved < providerReportedLifetime) {
      if (coverageStatus === "completed" || coverageStatus === "not_started") {
        coverageStatus = "standard_scan_completed";
      }
      if (!coverageEvidence) {
        coverageEvidence = `Standard scan completed: retrieved ${totalRetrieved.toLocaleString()} of ${providerReportedLifetime.toLocaleString()} lifetime channel videos (${coveragePercent}%). Additional catalog retrieval required.`;
      }
    } else {
      coveragePercent = 100;
      if (coverageStatus === "standard_scan_completed" || coverageStatus === "in_progress") {
        coverageStatus = "complete_within_verified_scope";
      }
      if (!coverageEvidence) {
        coverageEvidence = `All ${totalRetrieved.toLocaleString()} reported videos retrieved and verified.`;
      }
    }
  } else if (providerReportedQueryTotal && providerReportedQueryTotal > 0) {
    coveragePercent = Math.min(100, Math.round((totalRetrieved / providerReportedQueryTotal) * 1000) / 10);
    if (!coverageEvidence) {
      coverageEvidence = `Retrieved ${totalRetrieved} items within current query window (${providerReportedQueryTotal} reported). Lifetime channel total unknown.`;
    }
  } else {
    coveragePercent = null;
    if (!coverageEvidence) {
      coverageEvidence = "Global total unknown — date-window retrieval. Coverage cannot be independently verified.";
    }
  }

  // Activity calculation
  let isRecentlyActive = false;
  let lastActivityRelative: string | null = null;
  if (newest && newest.createdAt) {
    const diffMs = Date.now() - new Date(newest.createdAt).getTime();
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (daysAgo <= 30) {
      isRecentlyActive = true;
      lastActivityRelative = daysAgo === 0 ? "Today" : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`;
    } else if (daysAgo < 365) {
      const months = Math.floor(daysAgo / 30);
      lastActivityRelative = `${months} month${months > 1 ? "s" : ""} ago`;
    } else {
      const years = Math.floor(daysAgo / 365);
      lastActivityRelative = `${years} year${years > 1 ? "s" : ""} ago`;
    }
  }

  // Year & Month distributions
  const yearCounts = new Map<number, number>();
  const monthCounts = new Map<string, number>();

  for (const { timestamp } of validDatedVideos) {
    const d = new Date(timestamp);
    const yr = d.getUTCFullYear();
    yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);

    const mKey = `${yr}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(mKey, (monthCounts.get(mKey) || 0) + 1);
  }

  const byYear = Array.from(yearCounts.entries())
    .map(([year, count]) => ({
      year,
      count,
      percentage: totalRetrieved > 0 ? Math.round((count / totalRetrieved) * 100) : 0,
    }))
    .sort((a, b) => b.year - a.year);

  const byMonth = Array.from(monthCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12); // Last 12 active months

  const metrics: CatalogRetrievalMetrics = extraStats?.metrics ?? {
    providerReportedTotalPerQuery: providerReportedQueryTotal,
    providerReportedTotalLifetime: providerReportedLifetime,
    pagesFetched: extraStats?.pagesRetrieved ?? 1,
    uniqueRecordsFetched: totalRetrieved,
    duplicateRecordsSkipped: extraStats?.duplicatesSkipped ?? 0,
    uniqueRecordsPersisted: totalRetrieved,
    dateWindowsCompleted: extraStats?.diagnostics?.windows?.length ?? 1,
    dateWindowsRemaining: 0,
    failedRequests: 0,
    unresolvedWindows: 0,
    recordsUnavailableOrInaccessible: extraStats?.omittedOrUnavailable ?? 0,
    coverageStatus,
    coverageEvidence,
  };

  return {
    profile: {
      name: profileName,
      id: profileId,
      handle: profileHandle,
      canonicalUrl,
      avatarUrl,
      bannerUrl: null,
      description,
      country,
      language,
      createdDate,
      verified,
      apiVersion: version,
      retrievedAt: new Date().toISOString(),
      catalogStatus: coverageStatus,
      targetIdentity: extraStats?.targetIdentity,
    },
    statistics: {
      providerReportedVideos,
      providerReportedQueryTotal,
      providerReportedPlaylists: null,
      providerReportedLivestreams: null,
      locallyRetrievedVideos,
      locallyRetrievedPlaylists,
      locallyRetrievedLivestreams,
      totalRetrieved,
      isEstimated,
      isGlobalTotalUnknown,
      coveragePercent,
      coverageStatus,
      coverageEvidence,
      omittedOrUnavailableReferences: extraStats?.omittedOrUnavailable ?? 0,
      duplicatesSkipped: extraStats?.duplicatesSkipped ?? 0,
      pagesRetrieved: extraStats?.pagesRetrieved ?? 1,
      pagesRemaining: extraStats?.pagesRemaining ?? null,
    },
    chronology: {
      earliestPublicationDate: oldest?.createdAt || null,
      earliestCreationDate: createdDate || oldest?.createdAt || null,
      oldestVideo: oldestVideoRef,
      newestVideo: newestVideoRef,
      isRecentlyActive,
      lastActivityRelative,
    },
    distribution: {
      byYear,
      byMonth,
      byResourceType: typeCounts,
    },
    diagnostics: extraStats?.diagnostics,
    metrics,
  };
}
