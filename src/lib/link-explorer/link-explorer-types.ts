// Link Explorer Types & Intelligence Schema (2026)
//
// What this controls: Type definitions for the Advanced Dailymotion Resource Explorer &
// Channel Intelligence Workspace, including scan strategies, multi-page catalog progress,
// resource intelligence analysis, and exportable manifest structures.
// Scope: Link Explorer (/link-explorer).

import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import type { DailymotionAnalyzedLink, DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import type { DailymotionNormalizedError } from "@/lib/dailymotion/errors";

export type ScanStrategy = "quick" | "standard" | "deep" | "resume" | "custom";

export type ScanCompletenessStatus =
  | "not_started"
  | "discovering"
  | "fetching_pages"
  | "splitting_date_ranges"
  | "paused"
  | "interrupted"
  | "partial"
  | "completed"
  | "completed_with_known_limitations"
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
  };
  statistics: {
    providerReportedVideos: number | null;
    providerReportedPlaylists: number | null;
    providerReportedLivestreams: number | null;
    locallyRetrievedVideos: number;
    locallyRetrievedPlaylists: number;
    locallyRetrievedLivestreams: number;
    totalRetrieved: number;
    isEstimated: boolean;
    coveragePercent: number | null;
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
}

export interface LinkExplorerManifest {
  manifestId: string;
  sourceInput: string;
  identifier: string;
  resourceKind: DailymotionResourceKind;
  apiVersion: ApiVersion;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  sha256Checksum: string;
  intelligence: ResourceIntelligenceData | null;
  items: DiscoveryItem[];
  scanConfig: ScanBudgetConfig;
  status: ScanCompletenessStatus;
}

export interface LinkExplorerResolution {
  ok: boolean;
  analyzed: DailymotionAnalyzedLink;
  effectiveKind: DailymotionResourceKind;
  version: ApiVersion;
  item: DiscoveryItem | null;
  items: DiscoveryItem[];
  relatedItems?: DiscoveryItem[];
  hasMore?: boolean;
  page?: number;
  total?: number;
  error?: string;
  reason?: string;
  status?: number | null;
  normalized?: DailymotionNormalizedError;
  intelligence?: ResourceIntelligenceData | null;
  scanProgress?: ScanProgressState | null;
  manifest?: LinkExplorerManifest | null;
}

/**
 * Computes deep resource intelligence from catalog items and profile metadata.
 */
export function computeResourceIntelligence(
  items: DiscoveryItem[],
  mainItem: DiscoveryItem | null,
  version: ApiVersion,
  analyzed: DailymotionAnalyzedLink,
  catalogStatus: ScanCompletenessStatus = "completed"
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

  // Extract provider reported stats if present
  let providerReportedVideos: number | null = null;
  if (mainItem?.extra?.videos_total !== undefined && mainItem.extra.videos_total !== null) {
    const parsed = Number(mainItem.extra.videos_total);
    if (!Number.isNaN(parsed)) providerReportedVideos = parsed;
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
  const isEstimated = providerReportedVideos !== null && providerReportedVideos > 1000;
  let coveragePercent: number | null = null;
  if (providerReportedVideos && providerReportedVideos > 0) {
    coveragePercent = Math.min(100, Math.round((totalRetrieved / providerReportedVideos) * 1000) / 10);
  } else if (totalRetrieved > 0) {
    coveragePercent = 100;
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

  for (const { item, timestamp } of validDatedVideos) {
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
      catalogStatus,
    },
    statistics: {
      providerReportedVideos,
      providerReportedPlaylists: null,
      providerReportedLivestreams: null,
      locallyRetrievedVideos,
      locallyRetrievedPlaylists,
      locallyRetrievedLivestreams,
      totalRetrieved,
      isEstimated,
      coveragePercent,
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
  };
}
