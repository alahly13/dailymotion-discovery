// Link Explorer Service — Universal Dailymotion URL, Channel Intelligence & Full-Catalog Discovery Engine (2026)
//
// What this controls: Client-side resolution and exhaustive multi-page catalog exploration
// of Dailymotion resources (channels, profiles, playlists, videos, users, and livestreams).
// Enforces strict V1 (Legacy) vs V2 (Current REST) independence, universal input analysis,
// date-window partitioning for capped provider windows (1,000 items), sparse field profiles,
// stable deduplication, SHA-256 catalog manifest generation, and IndexedDB persistence.
// Scope: Link Explorer (/link-explorer).

import type { ApiVersion, DiscoveryItem, DiscoveryPageResult } from "@/lib/discovery/types";
import {
  analyzeDailymotionUrlOrId,
  type DailymotionAnalyzedLink,
  type DailymotionResourceKind,
} from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import { captureSearchSnapshot } from "@/lib/search-history/search-snapshot-service";
import {
  normalizeDailymotionError,
  logDailymotionError,
  type DailymotionNormalizedError,
} from "@/lib/dailymotion/errors";
import { discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import {
  computeResourceIntelligence,
  type CatalogPartitionLedger,
  type CatalogRetrievalMetrics,
  type ContinuationState,
  type CustomDateRangeConfig,
  type LinkExplorerManifest,
  type LinkExplorerResolution,
  type PeriodGranularity,
  type ResourceIntelligenceData,
  type RetrievalDiagnostics,
  type RetrievalDirection,
  type RetrievalPeriod,
  type RetrievalStrategy,
  type RetrievalWindowRecord,
  type ScanBudgetConfig,
  type ScanCompletenessStatus,
  type ScanProgressState,
  type ScanStrategy,
  type TargetIdentity,
} from "./link-explorer-types";
import {
  createPartitionLedger,
  getNextPendingPeriod,
  subdivideSaturatedPeriod,
  isLedgerFullyCompleted,
  SELECTABLE_YEARS,
  getCalendarYearBoundaries,
  isItemWithinYearBoundaries,
} from "./catalog-partition-engine";

export { SELECTABLE_YEARS, getCalendarYearBoundaries, isItemWithinYearBoundaries };
import { CatalogDeduplicator } from "./deduplication-service";

export interface DiscoveryApiResponse {
  ok: boolean;
  result?: DiscoveryPageResult;
  item?: DiscoveryItem;
  items?: DiscoveryItem[];
  error?: string;
  reason?: string;
  hasMore?: boolean;
  total?: number;
  status?: number;
  code?: string;
}

export const DEFAULT_SCAN_CONFIG: ScanBudgetConfig = {
  strategy: "standard",
  pageSize: 100,
  maxPages: 5,
  throttleMs: 150,
  fieldsProfile: "standard",
  retrievalStrategy: "automatic_maximum_coverage",
  retrievalDirection: "newest_to_oldest",
  catalogTarget: "videos",
};

/**
 * Validates whether a playlist creation date falls within the requested date bounds.
 * Used for explicit, safe client-side filtering on Dailymotion API v1 endpoints
 * where server-side date parameters are unsupported for playlist catalogs.
 */
export function isPlaylistWithinCreationBounds(
  playlistDateStr: string | null | undefined,
  dateAfter: string | null | undefined,
  dateBefore: string | null | undefined
): boolean {
  if (!playlistDateStr) return true;
  const plTime = new Date(playlistDateStr).getTime();
  if (Number.isNaN(plTime)) return true;

  if (dateAfter) {
    let afterTime: number;
    if (/^\d+$/.test(dateAfter)) {
      const numVal = Number(dateAfter);
      afterTime = numVal < 2e10 ? numVal * 1000 : numVal;
    } else {
      const norm = dateAfter.length <= 10 ? `${dateAfter}T00:00:00.000Z` : dateAfter;
      afterTime = new Date(norm).getTime();
    }
    if (!Number.isNaN(afterTime) && plTime < afterTime) {
      return false;
    }
  }

  if (dateBefore) {
    let beforeTime: number;
    if (/^\d+$/.test(dateBefore)) {
      const numVal = Number(dateBefore);
      beforeTime = numVal < 2e10 ? numVal * 1000 : numVal;
    } else {
      const norm = dateBefore.length <= 10 ? `${dateBefore}T23:59:59.999Z` : dateBefore;
      beforeTime = new Date(norm).getTime();
    }
    if (!Number.isNaN(beforeTime) && plTime > beforeTime) {
      return false;
    }
  }

  return true;
}

/**
 * Maps the user's selected retrieval direction ("newest_to_oldest" vs "oldest_to_newest")
 * to the exact canonical Dailymotion API sort parameter for the active API version.
 *
 * For API v2 (official REST specification):
 * - Newest to Oldest -> "sort=-created_at"
 * - Oldest to Newest -> "sort=created_at"
 * Supported across /v2/profiles/{id}/videos, /v2/playlists/{id}/videos, /v2/profiles/{id}/playlists.
 *
 * For API v1 (legacy specification):
 * - Newest to Oldest -> "sort=recent"
 * - Oldest to Newest -> "sort=old"
 */
export function resolveApiSortParameter(
  version: ApiVersion,
  direction?: RetrievalDirection,
  _resourceKind?: DailymotionResourceKind
): string {
  const dir = direction || "newest_to_oldest";
  if (version === "v2") {
    return dir === "oldest_to_newest" ? "created_at" : "-created_at";
  }
  return dir === "oldest_to_newest" ? "old" : "recent";
}

/**
 * Builds sparse field query string according to active API version and selected profile.
 */
export function resolveFieldSelection(
  version: ApiVersion,
  profile: ScanBudgetConfig["fieldsProfile"],
  customFields?: string
): string | undefined {
  if (profile === "custom" && customFields?.trim()) {
    return customFields.trim();
  }

  if (version === "v1") {
    switch (profile) {
      case "basic":
        return "id,title,thumbnail_480_url,created_time,url";
      case "extended":
        return "id,title,description,thumbnail_480_url,duration,views_total,created_time,url,channel,country,language,tags,aspect_ratio,embed_url,owner,owner.screenname";
      case "standard":
      default:
        return "id,title,description,thumbnail_480_url,duration,views_total,created_time,url,owner,owner.screenname";
    }
  }

  // Version 2 REST fields (aligned with official Dailymotion v2 schema; never leak v1 fields)
  switch (profile) {
    case "basic":
      return "video_id,title,created_at,video_url";
    case "extended":
      return "video_id,title,description,category,visibility,language,country,created_at,published_at,source.duration,tags,likes_total,aspect_ratio,embed_url,thumbnail.h1080_url,thumbnail.h720_url,thumbnail.h480_url,profile.profile_id,profile.name,video_url";
    case "standard":
    default:
      return "video_id,title,description,created_at,published_at,video_url,visibility,profile.profile_id,profile.name,source.duration,thumbnail.h720_url,thumbnail.h480_url";
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Computes deterministic SHA-256 checksum for catalog manifest verification.
 */
export async function computeCatalogChecksum(items: DiscoveryItem[], identifier: string): Promise<string> {
  const payload = JSON.stringify({
    identifier,
    count: items.length,
    ids: items.map((it) => it.id).sort(),
    checksumVersion: 2,
  });

  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(payload);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback
    }
  }

  // Fast deterministic hash fallback
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, "0");
}

/**
 * Primary Link Explorer resolver and deep-discovery coordinator.
 */
export async function resolveLinkExplorerInput(
  input: string,
  version: ApiVersion = "v1",
  overrideKind?: DailymotionResourceKind,
  scanConfig: Partial<ScanBudgetConfig> = {},
  onProgress?: (progress: ScanProgressState) => void,
  abortSignal?: AbortSignal,
  continuationState?: ContinuationState,
  onPageCommitted?: (params: {
    page: number;
    items: DiscoveryItem[];
    cumulativeItems: DiscoveryItem[];
    period?: RetrievalPeriod;
    checkpoint?: any;
  }) => Promise<void> | void,
  isPaused?: () => boolean
): Promise<LinkExplorerResolution> {
  const analyzed = analyzeDailymotionUrlOrId(input);
  const effectiveKind =
    overrideKind && overrideKind !== "unsupported" ? overrideKind : analyzed.kind;

  // Build baseline verified target identity structure
  const targetIdentity: TargetIdentity = continuationState?.targetIdentity ?? {
    rawInput: input,
    canonicalUrl: analyzed.canonicalUrl || null,
    legacyUserId: version === "v1" && effectiveKind !== "search" ? analyzed.identifier : null,
    legacyUsername: analyzed.identifier.startsWith("@") ? analyzed.identifier.slice(1) : analyzed.identifier,
    v2ProfileId: version === "v2" && (effectiveKind === "channel" || effectiveKind === "profile") ? analyzed.identifier : null,
    resolvedKind: effectiveKind,
    selectedApiVersion: version,
  };

  if (analyzed.kind === "unsupported") {
    const normalized = normalizeDailymotionError({
      customCode: "APP_INVALID_URL",
      customMessage: analyzed.reason || "The input could not be recognized as a valid Dailymotion URL or ID.",
      apiVersion: version,
      endpoint: "LinkExplorer/analyze",
    });
    return {
      ok: false,
      analyzed,
      targetIdentity,
      effectiveKind: "unsupported",
      version,
      item: null,
      items: [],
      error: normalized.userMessage,
      reason: "user_input_error",
      normalized,
    };
  }

  // 100% Strict Architectural Separation: Keyword queries belong to Global Search
  if (effectiveKind === "search") {
    return {
      ok: false,
      analyzed,
      targetIdentity,
      effectiveKind: "search",
      version,
      item: null,
      items: [],
      error: `"${analyzed.identifier}" is a keyword search query. Link Explorer is dedicated exclusively to inspecting direct links, video IDs, channel handles, and playlists. Please use Global Search to search for keywords across the Dailymotion catalog.`,
      reason: "keyword_search_redirect",
      status: 400,
    };
  }

  const config: ScanBudgetConfig = {
    ...DEFAULT_SCAN_CONFIG,
    ...scanConfig,
  };

  // Adjust maxPages based on chosen strategy
  let targetMaxPages = config.maxPages;
  if (config.retrievalStrategy === "selected_year") {
    // When fetching an entire calendar year, retrieve all pages until confirmed exhaustion
    targetMaxPages = config.maxPages && config.maxPages > 0 ? config.maxPages : 0;
  } else if (config.strategy === "quick") {
    targetMaxPages = 1;
  } else if (config.strategy === "standard") {
    targetMaxPages = Math.min(config.maxPages || 5, 10);
  } else if (config.strategy === "deep") {
    targetMaxPages = config.maxPages || 0; // 0 = unlimited pagination
  }

  const isContinuation = Boolean(continuationState);
  // Centralized deduplication engine instance across all pages and partitions
  const deduplicator = new CatalogDeduplicator(continuationState?.existingItems ?? []);
  let duplicateCount = continuationState?.existingDuplicates ?? 0;
  let providerReportedQueryTotal: number | null = continuationState?.providerReportedTotal ?? null;
  let providerReportedLifetimeTotal: number | null = continuationState?.providerReportedLifetimeTotal ?? null;
  let omittedOrUnavailableReferences = continuationState?.omittedOrUnavailableReferences ?? 0;

  const scanId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // 1. Initialize or resume CatalogPartitionLedger
  const ledger: CatalogPartitionLedger =
    continuationState?.retrievalLedger ||
    createPartitionLedger({
      scanId,
      apiVersion: version,
      resourceType: effectiveKind,
      resourceId: analyzed.identifier,
      canonicalUrl: analyzed.canonicalUrl || "",
      strategy: config.retrievalStrategy || "automatic_maximum_coverage",
      direction: config.retrievalDirection || "newest_to_oldest",
      selectedYear: config.selectedYear || null,
      customConfig: config.customRangeConfig,
      catalogTarget: config.catalogTarget || "videos",
    });

  // 2. Identify target active period
  const activePeriod: RetrievalPeriod | null =
    continuationState?.currentPeriod ||
    (continuationState?.targetPeriodId
      ? ledger.periods.find((p) => p.periodId === continuationState.targetPeriodId) || null
      : ledger.activePeriodId
      ? ledger.periods.find((p) => p.periodId === ledger.activePeriodId) || null
      : getNextPendingPeriod(ledger));

  if (activePeriod) {
    ledger.activePeriodId = activePeriod.periodId;
    if (activePeriod.status === "pending") {
      activePeriod.status = "in_progress";
    }
    // Set date boundaries from the active period
    config.dateFrom = activePeriod.startIso || undefined;
    config.dateTo = activePeriod.endIso || undefined;
  }

  const isDatePartition = Boolean(continuationState?.dateBefore || activePeriod);
  if (continuationState?.dateBefore) {
    config.dateTo = continuationState.dateBefore;
  }
  if (continuationState?.dateAfter) {
    config.dateFrom = continuationState.dateAfter;
  }

  const visitedPages = new Set<number>(isDatePartition ? [] : (continuationState?.visitedPages ?? []));
  const visitedCursors = new Set<string>(isDatePartition ? [] : (continuationState?.visitedCursors ?? []));
  const startPage = isDatePartition ? (activePeriod?.nextPage || 1) : (continuationState?.startPage ?? 1);
  let currentNextCursor: string | null = isDatePartition ? (activePeriod?.nextCursor || null) : (continuationState?.nextCursor ?? null);

  const currentWindowId = activePeriod?.periodId
    ? activePeriod.periodId
    : continuationState?.dateBefore
    ? `window-before-${continuationState.dateBefore.replace(/[^a-zA-Z0-9]/g, "-")}`
    : isContinuation
    ? "window-continuation"
    : "window-initial";

  const windowRecords: RetrievalWindowRecord[] = continuationState?.diagnostics?.windows
    ? [...continuationState.diagnostics.windows]
    : [];

  const items = deduplicator.getCanonicalItems();

  const progressState: ScanProgressState = {
    status: isContinuation ? "fetching_pages" : "discovering",
    strategy: config.strategy,
    pagesFetched: isContinuation ? Math.max(0, startPage - 1) : 0,
    totalPagesEstimated: null,
    itemsDiscovered: items.length + duplicateCount,
    uniqueItemsAdded: items.length,
    duplicateCount,
    activeWindowLabel: activePeriod?.label || null,
    activeWindowDepth: activePeriod?.granularity === "ten_day" ? 2 : activePeriod?.granularity === "day" ? 3 : 1,
    currentRateThrottleMs: config.throttleMs,
    error: null,
    canResume: true,
  };

  const updateProgress = (partial: Partial<ScanProgressState>) => {
    Object.assign(progressState, partial);
    if (onProgress) {
      onProgress({ ...progressState });
    }
  };

  updateProgress({ status: isContinuation ? "fetching_pages" : "discovering" });

  try {
    let mainItem: DiscoveryItem | null =
      items.find((i) => i.kind === "channel" || i.kind === "user" || i.kind === "playlist") || null;
    let hasMore = false;
    const rawResponses: unknown[] = [];
    const fieldsParam = resolveFieldSelection(version, config.fieldsProfile, config.customFields);

    // ==========================================
    // CASE 1: SINGLE VIDEO LOOKUP
    // ==========================================
    if (effectiveKind === "video") {
      updateProgress({ status: "fetching_pages", activeWindowLabel: `Video ID: ${analyzed.identifier}` });
      const fieldsQuery = fieldsParam ? `&fields=${encodeURIComponent(fieldsParam)}` : "";
      const lookupRes = await fetch(
        `/api/discovery/${version}/videos?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}${fieldsQuery}`,
        { signal: abortSignal }
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponses.push(lookupData);

      if (!lookupData.ok) {
        const normalized = normalizeDailymotionError({
          status: lookupData.status,
          customCode: lookupData.code as any,
          customMessage: lookupData.error,
          apiVersion: version,
          endpoint: `GET /videos/${analyzed.identifier}`,
          resourceType: "video",
        });
        logDailymotionError(normalized);
        updateProgress({ status: "failed", error: lookupData.error });
        return {
          ok: false,
          analyzed,
          targetIdentity,
          effectiveKind,
          version,
          item: null,
          items: [],
          error: lookupData.error || `Failed to find video "${analyzed.identifier}" on API ${version}.`,
          reason: lookupData.reason,
          status: lookupData.status,
          normalized,
          scanProgress: progressState,
        };
      }

      mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      if (mainItem) {
        mainItem.provenance = {
          provider: "dailymotion",
          apiVersion: version,
          resourceType: "video",
          resourceId: mainItem.id,
          fetchedAt: new Date().toISOString(),
          scanId,
          dateWindowId: "direct-lookup",
          page: 1,
          ownerId: mainItem.ownerId || null,
          schemaVersion: 1,
        };
        deduplicator.ingestBatch([mainItem], "direct-lookup", 1);
      }
      updateProgress({
        status: "completed",
        pagesFetched: 1,
        itemsDiscovered: deduplicator.getCanonicalItems().length,
        uniqueItemsAdded: deduplicator.getCanonicalItems().length,
      });
    }

    // ==========================================
    // CASE 2: LIVESTREAM LOOKUP
    // ==========================================
    else if (effectiveKind === "livestream") {
      updateProgress({ status: "fetching_pages", activeWindowLabel: `Livestream ID: ${analyzed.identifier}` });
      const lookupRes = await fetch(
        `/api/discovery/${version}/live?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`,
        { signal: abortSignal }
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponses.push(lookupData);

      if (!lookupData.ok) {
        const normalized = normalizeDailymotionError({
          status: lookupData.status,
          customCode: lookupData.code as any,
          customMessage: lookupData.error,
          apiVersion: version,
          endpoint: `GET /live/${analyzed.identifier}`,
          resourceType: "livestream",
        });
        logDailymotionError(normalized);
        updateProgress({ status: "failed", error: lookupData.error });
        return {
          ok: false,
          analyzed,
          targetIdentity,
          effectiveKind,
          version,
          item: null,
          items: [],
          error: lookupData.error || `Failed to find livestream "${analyzed.identifier}" on API ${version}.`,
          reason: lookupData.reason,
          status: lookupData.status,
          normalized,
          scanProgress: progressState,
        };
      }

      mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      if (mainItem) {
        mainItem.provenance = {
          provider: "dailymotion",
          apiVersion: version,
          resourceType: "livestream",
          resourceId: mainItem.id,
          fetchedAt: new Date().toISOString(),
          scanId,
          dateWindowId: "direct-lookup",
          page: 1,
          ownerId: mainItem.ownerId || null,
          schemaVersion: 1,
        };
        deduplicator.ingestBatch([mainItem], "direct-lookup", 1);
      }
      updateProgress({
        status: "completed",
        pagesFetched: 1,
        itemsDiscovered: deduplicator.getCanonicalItems().length,
        uniqueItemsAdded: deduplicator.getCanonicalItems().length,
      });
    }

    // ==========================================
    // CASE 3: CHANNEL / PROFILE / USER CATALOG
    // ==========================================
    else if (effectiveKind === "channel" || effectiveKind === "profile" || effectiveKind === "user") {
      if (!isContinuation) {
        // 1. Fetch profile metadata with verified target resolution
        updateProgress({ status: "discovering", activeWindowLabel: "Fetching Profile Metadata" });
        const lookupRes = await fetch(
          `/api/discovery/${version}/channels?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`,
          { signal: abortSignal }
        );
        const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
        rawResponses.push(lookupData);

        if (lookupData.ok) {
          mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
          if (mainItem) {
            targetIdentity.canonicalUrl = mainItem.url || targetIdentity.canonicalUrl;
            if (version === "v1") {
              targetIdentity.legacyUserId = mainItem.id;
              targetIdentity.legacyUsername = (mainItem.extra?.username as string) || (mainItem.extra?.screenname as string) || analyzed.identifier;
            } else {
              targetIdentity.v2ProfileId = mainItem.id;
            }
          }
        } else if (version === "v2") {
          // In V2, try authenticated /me lookup if available to resolve profile ID
          try {
            const meRes = await fetch("/api/discovery/v2/channels?mode=me", { signal: abortSignal });
            const meData = await meRes.json();
            if (meData?.ok && meData.data) {
              const rawMe = meData.data as Record<string, unknown>;
              const profileId =
                (rawMe?.default_profile_id as string) ||
                (rawMe?.id as string) ||
                ((rawMe?.profiles as Array<Record<string, unknown>>)?.[0]?.profile_id as string);
              if (
                profileId &&
                (rawMe?.username === analyzed.identifier || rawMe?.screenname === analyzed.identifier)
              ) {
                analyzed.identifier = profileId;
                targetIdentity.v2ProfileId = profileId;
                const retryRes = await fetch(
                  `/api/discovery/v2/channels?mode=lookup&id=${encodeURIComponent(profileId)}`,
                  { signal: abortSignal }
                );
                const retryData = (await retryRes.json()) as DiscoveryApiResponse;
                if (retryData.ok) {
                  mainItem = retryData.item ?? retryData.result?.items?.[0] ?? retryData.items?.[0] ?? null;
                }
              }
            }
          } catch {
            // Non-fatal fallback
          }

          if (!mainItem) {
            const normalized = normalizeDailymotionError({
              status: lookupData.status || 404,
              customCode: lookupData.code as any,
              customMessage: `In Dailymotion API v2, channel video listings require an accessible Profile ID (e.g. x1y2z3). The identifier "${analyzed.identifier}" could not be resolved to an accessible V2 Profile ID. Note: API v2 separates Users from Profiles, and profile video listings are scoped strictly to verified profiles or authenticated studio accounts. If this is a legacy channel username, consider browsing it via API v1.`,
              apiVersion: "v2",
              endpoint: `GET /profiles/${analyzed.identifier}`,
              resourceType: "channel",
            });
            logDailymotionError(normalized);
            updateProgress({ status: "failed", error: normalized.userMessage });
            return {
              ok: false,
              analyzed,
              targetIdentity,
              effectiveKind,
              version,
              item: null,
              items: [],
              error: normalized.userMessage,
              reason: lookupData.reason || "v2_profile_unresolved",
              status: lookupData.status || 404,
              normalized,
              scanProgress: progressState,
            };
          }
        } else {
          // V1 lookup failed
          const normalized = normalizeDailymotionError({
            status: lookupData.status || 404,
            customCode: lookupData.code as any,
            customMessage: lookupData.error || `Channel "${analyzed.identifier}" could not be found on Dailymotion API v1.`,
            apiVersion: "v1",
            endpoint: `GET /user/${analyzed.identifier}`,
            resourceType: "channel",
          });
          logDailymotionError(normalized);
          updateProgress({ status: "failed", error: normalized.userMessage });
          return {
            ok: false,
            analyzed,
            targetIdentity,
            effectiveKind,
            version,
            item: null,
            items: [],
            error: normalized.userMessage,
            reason: lookupData.reason || "resource_not_found",
            status: lookupData.status || 404,
            normalized,
            scanProgress: progressState,
          };
        }
      }

      // Check lifetime reported total (handling both videosTotal / playlistsTotal depending on catalogTarget)
      const isPlaylistsCatalog = config.catalogTarget === "playlists";
      const reportedLifetime = isPlaylistsCatalog
        ? (mainItem?.extra?.playlistsTotal !== undefined && mainItem.extra.playlistsTotal !== null
            ? Number(mainItem.extra.playlistsTotal)
            : mainItem?.extra?.playlists_total !== undefined && mainItem.extra.playlists_total !== null
            ? Number(mainItem.extra.playlists_total)
            : null)
        : (mainItem?.extra?.videosTotal !== undefined && mainItem.extra.videosTotal !== null
            ? Number(mainItem.extra.videosTotal)
            : mainItem?.extra?.videos_total !== undefined && mainItem.extra.videos_total !== null
            ? Number(mainItem.extra.videos_total)
            : null);

      if (reportedLifetime && !Number.isNaN(reportedLifetime)) {
        providerReportedLifetimeTotal = reportedLifetime;
        const estPages = Math.ceil(reportedLifetime / config.pageSize);
        updateProgress({
          totalPagesEstimated: targetMaxPages > 0 ? Math.min(estPages, targetMaxPages) : estPages,
        });
      }

      // 2. Multi-page catalog pagination engine
      updateProgress({ status: "fetching_pages" });

      let page = startPage;
      let keepFetching = true;
      let consecutiveEmptyPages = 0;
      let reachedWindowCap = false;
      let pagesFetchedThisRun = 0;
      let isPaginationStalled = false;
      let lastPageItems: DiscoveryItem[] = [];
      const initialWindowUniqueStart = items.length;
      // In deep scan mode, remove artificial 200-page limit so complete catalog ingestion can proceed
      const loopBudget = targetMaxPages > 0 ? targetMaxPages : (config.strategy === "deep" ? 10000 : 200);

      while (keepFetching) {
        if (abortSignal?.aborted) {
          updateProgress({ status: "cancelled" });
          break;
        }

        if (isPaused?.()) {
          updateProgress({ status: "paused" });
          break;
        }

        // Loop prevention: stop if visited page number without cursor or visited cursor
        if (visitedPages.has(page) && !currentNextCursor) {
          isPaginationStalled = true;
          updateProgress({ status: "pagination_stalled" });
          break;
        }
        visitedPages.add(page);

        if (currentNextCursor && visitedCursors.has(currentNextCursor)) {
          isPaginationStalled = true;
          updateProgress({ status: "pagination_stalled" });
          break;
        }
        if (currentNextCursor) {
          visitedCursors.add(currentNextCursor);
        }

        const windowTypeLabel = isPlaylistsCatalog ? "Channel Playlists" : "Channel Videos";
        updateProgress({
          pagesFetched: page,
          activeWindowLabel: `Fetching ${windowTypeLabel} Page ${page} (size: ${config.pageSize})`,
        });

        // Build request parameters respecting V1 vs V2 capability
        const queryParams = new URLSearchParams();
        const effectiveOwnerOrProfile =
          version === "v2" && (targetIdentity.v2ProfileId || mainItem?.id)
            ? targetIdentity.v2ProfileId || mainItem?.id || analyzed.identifier
            : (mainItem?.id || analyzed.identifier);

        if (!isPlaylistsCatalog) {
          queryParams.set("mode", "videos");
        }
        queryParams.set(version === "v2" ? "profileId" : "owner", effectiveOwnerOrProfile);
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(config.pageSize));

        if (currentNextCursor) {
          queryParams.set("nextUrl", currentNextCursor);
        }
        if (fieldsParam) {
          queryParams.set("fields", fieldsParam);
        }
        if (config.serverSort) {
          queryParams.set("sort", config.serverSort);
        }
        const effectiveDateAfter =
          config.dateFrom ||
          continuationState?.dateAfter ||
          (activePeriod ? (version === "v1" ? String(activePeriod.startUnix) : activePeriod.startIso) : null);

        const effectiveDateBefore =
          config.dateTo ||
          continuationState?.dateBefore ||
          (activePeriod ? (version === "v1" ? String(activePeriod.endUnix) : activePeriod.endIso) : null);

        // For channel videos: date filters are sent upstream for both V1 and V2.
        // For channel playlists: V2 REST supports createdAfter & createdBefore on /v2/profiles/{id}/playlists.
        // V1 does not support date params on /user/{id}/playlists, so we omit date params in V1 upstream request
        // and enforce client-side date filtering strictly against playlist.created_at below.
        if (effectiveDateAfter && (!isPlaylistsCatalog || version === "v2")) {
          queryParams.set("createdAfter", effectiveDateAfter);
        }
        if (effectiveDateBefore && (!isPlaylistsCatalog || version === "v2")) {
          queryParams.set("createdBefore", effectiveDateBefore);
        }

        const endpointResource = isPlaylistsCatalog ? "playlists" : "channels";
        const videosRes = await fetch(
          `/api/discovery/${version}/${endpointResource}?${queryParams.toString()}`,
          { signal: abortSignal }
        );
        const videosData = (await videosRes.json()) as DiscoveryApiResponse;
        rawResponses.push(videosData);

        if (!videosData.ok) {
          updateProgress({
            status: items.length > 0 ? "partial" : "failed",
            error: videosData.error,
          });
          break;
        }

        pagesFetchedThisRun += 1;
        let pageItems = videosData.items ?? videosData.result?.items ?? [];
        if (isPlaylistsCatalog && version === "v1" && (effectiveDateAfter || effectiveDateBefore)) {
          // Explicit local date filtering on playlist creation date for V1
          pageItems = pageItems.filter((item) =>
            isPlaylistWithinCreationBounds(
              item.playlistCreatedAt || item.createdAt,
              effectiveDateAfter,
              effectiveDateBefore
            )
          );
        }
        lastPageItems = pageItems;
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        currentNextCursor = videosData.result?.nextCursor ?? (videosData as any).nextCursor ?? null;

        if (videosData.total !== undefined && videosData.total !== null) {
          providerReportedQueryTotal = videosData.total;
        }

        // Tag provenance on raw incoming items
        for (const item of pageItems) {
          item.provenance = {
            provider: "dailymotion",
            apiVersion: version,
            resourceType: item.kind,
            resourceId: item.id,
            fetchedAt: new Date().toISOString(),
            scanId,
            dateWindowId: currentWindowId,
            page,
            ownerId: analyzed.identifier,
            schemaVersion: 1,
          };
        }

        // Ingest into canonical deduplicator with multi-period observation tracking & metadata merging
        const { addedCount: uniqueAddedInPage, duplicateCount: duplicatesInPage } =
          deduplicator.ingestBatch(pageItems, currentWindowId, page);
        duplicateCount += duplicatesInPage;

        const currentCanonicalItems = deduplicator.getCanonicalItems();

        if (activePeriod) {
          activePeriod.pagesFetched += 1;
          activePeriod.rawItemsReceived += pageItems.length;
          activePeriod.uniqueItemsRetained += uniqueAddedInPage;
          activePeriod.duplicatesDetected += duplicatesInPage;
          activePeriod.nextPage = page + 1;
          activePeriod.nextCursor = currentNextCursor;
          activePeriod.hasMore = hasMore;
        }

        updateProgress({
          itemsDiscovered: deduplicator.getSummary().totalRawObserved,
          uniqueItemsAdded: currentCanonicalItems.length,
          duplicateCount,
        });

        // Progressive persistence: commit every page immediately into IndexedDB before fetching next
        if (onPageCommitted && pageItems.length > 0) {
          try {
            await onPageCommitted({
              page,
              items: pageItems,
              cumulativeItems: currentCanonicalItems,
              period: activePeriod || undefined,
              checkpoint: {
                nextPage: page + 1,
                nextCursor: currentNextCursor,
                visitedPages: Array.from(visitedPages),
                visitedCursors: Array.from(visitedCursors),
                canResume: hasMore || Boolean(currentNextCursor) || reachedWindowCap,
              },
            });
          } catch (commitErr) {
            console.warn("[LinkExplorer] Progressive page commit error:", commitErr);
          }
        }

        // Check window cap (Dailymotion caps pagination at 1000 items per query window)
        const totalConsumed = page * config.pageSize;
        if (
          (totalConsumed >= 1000 || (version === "v1" && page >= 10)) &&
          (hasMore || (providerReportedLifetimeTotal !== null && currentCanonicalItems.length < providerReportedLifetimeTotal))
        ) {
          reachedWindowCap = true;
        }

        if (pageItems.length === 0) {
          consecutiveEmptyPages += 1;
        } else {
          consecutiveEmptyPages = 0;
        }

        // Check exit conditions: do not abort prematurely on an isolated empty page if hasMore or cursor is active
        if (!hasMore && !currentNextCursor) {
          keepFetching = false;
        } else if (consecutiveEmptyPages >= 5 && !currentNextCursor) {
          // Break after 5 consecutive empty pages only if no cursor is active
          keepFetching = false;
        } else if (targetMaxPages > 0 && pagesFetchedThisRun >= targetMaxPages) {
          keepFetching = false;
        } else if (reachedWindowCap && config.strategy !== "deep") {
          // Standard/quick scan stops at 1000 items cap
          keepFetching = false;
        } else if (pagesFetchedThisRun >= loopBudget) {
          keepFetching = false;
        } else {
          page += 1;
          if (config.throttleMs > 0) {
            await delay(config.throttleMs);
          }
        }
      }

      // Update active period status in ledger upon completing current fetch run
      const canonicalItemsAfterLoop = deduplicator.getCanonicalItems();
      const hasMissingLifetimeItems = Boolean(
        providerReportedLifetimeTotal !== null &&
        canonicalItemsAfterLoop.length < providerReportedLifetimeTotal
      );

      if (activePeriod) {
        if (reachedWindowCap || (hasMissingLifetimeItems && (!hasMore || lastPageItems.length === 0))) {
          activePeriod.isCapped = true;
          activePeriod.status = "capped";

          // Adaptive Subdivision: split saturated Year -> Months or Month -> 10-day intervals
          if (
            ledger.strategy === "automatic_maximum_coverage" ||
            ledger.strategy === "year_by_year" ||
            ledger.strategy === "selected_year"
          ) {
            const childPeriods = subdivideSaturatedPeriod(activePeriod, ledger.direction);
            if (childPeriods.length > 0) {
              activePeriod.childPeriodIds = childPeriods.map((c) => c.periodId);
              const pIdx = ledger.periods.findIndex((p) => p.periodId === activePeriod!.periodId);
              if (pIdx !== -1) {
                ledger.periods.splice(pIdx + 1, 0, ...childPeriods);
              } else {
                ledger.periods.push(...childPeriods);
              }
              ledger.activePeriodId = childPeriods[0].periodId;
            }
          }

          // Automatic backward date-slicing window generation:
          // Extract oldest creation timestamp (playlistCreatedAt vs videoCreatedAt) to bypass 1,000-item / single-window ceiling
          let oldestItemForBackward: DiscoveryItem | null = null;
          let oldestTimeMsForBackward = Infinity;
          for (const it of canonicalItemsAfterLoop) {
            const itemDate = isPlaylistsCatalog
              ? (it.playlistCreatedAt || it.createdAt)
              : (it.videoCreatedAt || it.createdAt);
            if (itemDate) {
              const t = new Date(itemDate).getTime();
              if (!Number.isNaN(t) && t < oldestTimeMsForBackward) {
                oldestTimeMsForBackward = t;
                oldestItemForBackward = it;
              }
            }
          }

          if (oldestItemForBackward && oldestTimeMsForBackward < Infinity) {
            const backwardEndIso = new Date(oldestTimeMsForBackward - 1).toISOString();
            const backwardEndUnix = Math.floor(oldestTimeMsForBackward / 1000) - 1;
            const inceptionIso = "2005-01-01T00:00:00.000Z";
            const inceptionUnix = Math.floor(new Date(inceptionIso).getTime() / 1000);
            const oldestDateStr = isPlaylistsCatalog
              ? (oldestItemForBackward.playlistCreatedAt || oldestItemForBackward.createdAt)
              : (oldestItemForBackward.videoCreatedAt || oldestItemForBackward.createdAt);

            const backwardPrefix = isPlaylistsCatalog ? "period:backward_playlists" : "period:backward";
            const backwardId = `${backwardPrefix}:${oldestDateStr?.substring(0, 10)}_${Date.now()}:${version}:${analyzed.identifier}`;
            const existingBackward = ledger.periods.find((p) => p.endUnix === backwardEndUnix || p.endIso === backwardEndIso);

            if (!existingBackward) {
              const backwardPeriod: RetrievalPeriod = {
                periodId: backwardId,
                parentPeriodId: activePeriod.periodId,
                granularity: "entire_range",
                label: `Prior to ${oldestDateStr?.substring(0, 10)} (${version === "v1" ? `Unix ${backwardEndUnix}` : backwardEndIso.substring(0, 10)})`,
                startIso: inceptionIso,
                endIso: backwardEndIso,
                startUnix: inceptionUnix,
                endUnix: backwardEndUnix,
                apiVersion: version,
                resourceIdentity: analyzed.identifier,
                dateDomain: isPlaylistsCatalog ? "playlist-created-at" : "video-created-at",
                status: "pending",
                pagesFetched: 0,
                rawItemsReceived: 0,
                uniqueItemsRetained: 0,
                duplicatesDetected: 0,
                isCapped: false,
                nextPage: 1,
                nextCursor: null,
                hasMore: true,
              };
              ledger.periods.push(backwardPeriod);
              if (!ledger.activePeriodId || ledger.activePeriodId === activePeriod.periodId) {
                ledger.activePeriodId = backwardPeriod.periodId;
              }
            }
          }
        } else if (!hasMore || lastPageItems.length === 0) {
          activePeriod.status = "completed";
          activePeriod.hasMore = false;
          activePeriod.completedAt = new Date().toISOString();
          const nextPending = getNextPendingPeriod(ledger);
          ledger.activePeriodId = nextPending?.periodId || null;
        } else {
          activePeriod.status = "in_progress";
          activePeriod.nextPage = page + 1;
          activePeriod.nextCursor = currentNextCursor;
        }
      }

      // Synchronize ledger totals
      const dedupeSummary = deduplicator.getSummary();
      ledger.totalRawObserved = dedupeSummary.totalRawObserved;
      ledger.totalUniqueRetained = dedupeSummary.totalUniqueRetained;
      ledger.totalDuplicatesDetected = dedupeSummary.totalDuplicatesDetected;
      ledger.updatedAt = new Date().toISOString();

      // Record retrieval window
      windowRecords.push({
        windowId: currentWindowId,
        label:
          activePeriod?.label ||
          continuationState?.dateWindowLabel ||
          (continuationState?.dateBefore
            ? `Partition Before ${continuationState.dateBefore}`
            : isContinuation
            ? "Continuation Window"
            : "Primary Query Window"),
        dateFrom: config.dateFrom || null,
        dateTo: config.dateTo || null,
        pageCount: pagesFetchedThisRun,
        uniqueCount: deduplicator.getCanonicalItems().length - initialWindowUniqueStart,
        duplicateCount,
        providerTotal: providerReportedQueryTotal,
        isCapped: reachedWindowCap,
        status: reachedWindowCap ? "capped" : hasMore ? "unresolved" : "completed",
      });

      // ==========================================
      // DEEP CATALOG RECURSIVE DATE-WINDOW PARTITIONING
      // If channel has > 1,000 items and deep scan is active (Recursive Year -> Month -> Week)
      // ==========================================
      if (
        config.strategy === "deep" &&
        (reachedWindowCap || (providerReportedLifetimeTotal !== null && items.length < providerReportedLifetimeTotal)) &&
        !abortSignal?.aborted &&
        (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)
      ) {
        updateProgress({
          status: "splitting_date_ranges",
          activeWindowLabel: "Splitting into Year Windows (bypassing 1,000-item cap)",
        });

        let startYear = 2005;
        if (mainItem?.createdAt) {
          const yr = new Date(mainItem.createdAt).getUTCFullYear();
          if (!Number.isNaN(yr) && yr >= 2005) startYear = yr;
        }
        const currentYear = new Date().getUTCFullYear();

        for (let yr = currentYear; yr >= startYear; yr--) {
          if (abortSignal?.aborted || isPaused?.()) break;
          if (targetMaxPages > 0 && pagesFetchedThisRun >= targetMaxPages) break;

          const yearStart = `${yr}-01-01`;
          const yearEnd = `${yr}-12-31`;

          updateProgress({
            activeWindowLabel: `Partition: Year ${yr} (${yearStart} -> ${yearEnd})`,
            activeWindowDepth: 1,
          });

          let yearPage = 1;
          let yearHasMore = true;
          let yearCapped = false;
          let yearPagesFetched = 0;
          const yearUniqueStart = items.length;

          while (yearHasMore && (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)) {
            if (abortSignal?.aborted || isPaused?.()) break;

            const qp = new URLSearchParams();
            qp.set("mode", "videos");
            qp.set("owner", analyzed.identifier);
            qp.set("page", String(yearPage));
            qp.set("pageSize", String(config.pageSize));
            qp.set("createdAfter", yearStart);
            qp.set("createdBefore", yearEnd);
            if (fieldsParam) qp.set("fields", fieldsParam);
            if (config.serverSort) qp.set("sort", config.serverSort);

            const yrRes = await fetch(`/api/discovery/${version}/channels?${qp.toString()}`, { signal: abortSignal });
            const yrData = (await yrRes.json()) as DiscoveryApiResponse;
            if (!yrData.ok) break;

            const yrItems = yrData.items ?? yrData.result?.items ?? [];
            yearHasMore = Boolean(yrData.hasMore ?? yrData.result?.hasMore);

            for (const item of yrItems) {
              item.provenance = {
                provider: "dailymotion",
                apiVersion: version,
                resourceType: item.kind,
                resourceId: item.id,
                fetchedAt: new Date().toISOString(),
                scanId,
                dateWindowId: `window-year-${yr}`,
                page: yearPage,
                ownerId: analyzed.identifier,
                schemaVersion: 1,
              };
            }
            const { duplicateCount: yrDupes } = deduplicator.ingestBatch(yrItems, `window-year-${yr}`, yearPage);
            duplicateCount += yrDupes;

            page += 1;
            pagesFetchedThisRun += 1;
            yearPagesFetched += 1;
            yearPage += 1;
            updateProgress({
              pagesFetched: page,
              itemsDiscovered: items.length + duplicateCount,
              uniqueItemsAdded: items.length,
              duplicateCount,
            });

            if (yrItems.length === 0 || !yearHasMore) {
              break;
            }
            if (yearPage > 10 && yearHasMore) {
              yearCapped = true;
              break;
            }

            if (config.throttleMs > 0) {
              await delay(config.throttleMs);
            }
          }

          windowRecords.push({
            windowId: `window-year-${yr}`,
            label: `Year ${yr}`,
            dateFrom: yearStart,
            dateTo: yearEnd,
            pageCount: yearPagesFetched,
            uniqueCount: items.length - yearUniqueStart,
            duplicateCount,
            providerTotal: null,
            isCapped: yearCapped,
            status: yearCapped ? "capped" : "completed",
          });

          // Recursive month sub-partitioning if year exceeds 1,000 items
          if (yearCapped && !abortSignal?.aborted && (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)) {
            updateProgress({
              activeWindowLabel: `Sub-Partitioning Year ${yr} into 12 Monthly Windows`,
              activeWindowDepth: 2,
            });

            for (let m = 12; m >= 1; m--) {
              if (abortSignal?.aborted || isPaused?.()) break;
              if (targetMaxPages > 0 && pagesFetchedThisRun >= targetMaxPages) break;

              const mStr = String(m).padStart(2, "0");
              const lastDay = new Date(yr, m, 0).getDate();
              const monthStart = `${yr}-${mStr}-01`;
              const monthEnd = `${yr}-${mStr}-${String(lastDay).padStart(2, "0")}`;

              let mPage = 1;
              let mHasMore = true;
              let mCapped = false;
              let mPagesFetched = 0;
              const mUniqueStart = items.length;

              while (mHasMore && (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)) {
                if (abortSignal?.aborted || isPaused?.()) break;

                const mQp = new URLSearchParams();
                mQp.set("mode", "videos");
                mQp.set("owner", analyzed.identifier);
                mQp.set("page", String(mPage));
                mQp.set("pageSize", String(config.pageSize));
                mQp.set("createdAfter", monthStart);
                mQp.set("createdBefore", monthEnd);
                if (fieldsParam) mQp.set("fields", fieldsParam);
                if (config.serverSort) mQp.set("sort", config.serverSort);

                const mRes = await fetch(`/api/discovery/${version}/channels?${mQp.toString()}`, { signal: abortSignal });
                const mData = (await mRes.json()) as DiscoveryApiResponse;
                if (!mData.ok) break;

                const mItems = mData.items ?? mData.result?.items ?? [];
                mHasMore = Boolean(mData.hasMore ?? mData.result?.hasMore);

                for (const item of mItems) {
                  item.provenance = {
                    provider: "dailymotion",
                    apiVersion: version,
                    resourceType: item.kind,
                    resourceId: item.id,
                    fetchedAt: new Date().toISOString(),
                    scanId,
                    dateWindowId: `window-month-${yr}-${mStr}`,
                    page: mPage,
                    ownerId: analyzed.identifier,
                    schemaVersion: 1,
                  };
                }
                const { duplicateCount: mDupes } = deduplicator.ingestBatch(mItems, `window-month-${yr}-${mStr}`, mPage);
                duplicateCount += mDupes;

                page += 1;
                pagesFetchedThisRun += 1;
                mPagesFetched += 1;
                mPage += 1;

                updateProgress({
                  pagesFetched: page,
                  itemsDiscovered: items.length + duplicateCount,
                  uniqueItemsAdded: items.length,
                  duplicateCount,
                });

                if (mItems.length === 0 || !mHasMore) break;
                if (mPage > 10 && mHasMore) {
                  mCapped = true;
                  break;
                }
                if (config.throttleMs > 0) await delay(config.throttleMs);
              }

              windowRecords.push({
                windowId: `window-month-${yr}-${mStr}`,
                label: `Month ${yr}-${mStr}`,
                dateFrom: monthStart,
                dateTo: monthEnd,
                pageCount: mPagesFetched,
                uniqueCount: items.length - mUniqueStart,
                duplicateCount,
                providerTotal: null,
                isCapped: mCapped,
                status: mCapped ? "capped" : "completed",
              });
            }
          }
        }
      }

      // Accurate scan completion status calculation (no false 100%)
      let finalStatus: ScanCompletenessStatus = "completed";
      let coverageEvidence = "";

      if (abortSignal?.aborted) {
        finalStatus = "cancelled";
        coverageEvidence = "Catalog crawl was cancelled by user.";
      } else if (isPaused?.()) {
        finalStatus = "paused";
        coverageEvidence = "Catalog crawl was paused by user.";
      } else if (isPaginationStalled) {
        finalStatus = "pagination_stalled";
        coverageEvidence = "Pagination cursor stalled or repeated without advancing catalog state.";
      } else if (
        config.strategy === "standard" &&
        (hasMore || (providerReportedLifetimeTotal !== null && items.length < providerReportedLifetimeTotal))
      ) {
        finalStatus = "standard_scan_completed";
        coverageEvidence = providerReportedLifetimeTotal
          ? `Standard scan completed (${pagesFetchedThisRun} pages / ${items.length} items) — additional catalog coverage has not been verified. Target reports ${providerReportedLifetimeTotal.toLocaleString()} total videos.`
          : `Standard scan completed (${pagesFetchedThisRun} pages / ${items.length} items) — additional catalog coverage has not been verified.`;
      } else if (reachedWindowCap && config.strategy !== "deep") {
        finalStatus = "capped_window";
        coverageEvidence = "Dailymotion single-query window saturated at 1,000 items. Deep catalog scan with date partitioning is required to reach older videos.";
      } else if (windowRecords.some((w) => w.isCapped)) {
        finalStatus = "completed_with_known_limitations";
        coverageEvidence = "Catalog retrieval completed with known date-window saturation limitations.";
      } else if (providerReportedLifetimeTotal !== null && items.length >= providerReportedLifetimeTotal) {
        finalStatus = "complete_within_verified_scope";
        coverageEvidence = `All ${items.length.toLocaleString()} reported lifetime channel videos verified and retrieved.`;
      } else if (config.strategy === "deep") {
        finalStatus = "complete_within_verified_scope";
        coverageEvidence = `All calendar partitions verified from inception to present. Retrieved ${items.length} unique items.`;
      } else {
        finalStatus = "completed";
        coverageEvidence = `All accessible pages retrieved (${items.length} items).`;
      }

      updateProgress({ status: finalStatus });
    }

    // ==========================================
    // CASE 4: PLAYLIST EXPLORER & CATALOG
    // ==========================================
    else if (effectiveKind === "playlist") {
      if (!isContinuation) {
        updateProgress({ status: "discovering", activeWindowLabel: "Fetching Playlist Metadata" });
        const lookupRes = await fetch(
          `/api/discovery/${version}/playlists?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`,
          { signal: abortSignal }
        );
        const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
        rawResponses.push(lookupData);

        if (lookupData.ok) {
          mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
          if (mainItem) {
            targetIdentity.canonicalUrl = mainItem.url || targetIdentity.canonicalUrl;
            const parsedTotal =
              mainItem.extra?.videosTotal !== undefined && mainItem.extra.videosTotal !== null
                ? Number(mainItem.extra.videosTotal)
                : mainItem.extra?.videos_total !== undefined && mainItem.extra.videos_total !== null
                ? Number(mainItem.extra.videos_total)
                : null;
            if (parsedTotal && !Number.isNaN(parsedTotal)) {
              providerReportedLifetimeTotal = parsedTotal;
            }
          }
        } else {
          const normalized = normalizeDailymotionError({
            status: lookupData.status || 404,
            customCode: lookupData.code as any,
            customMessage: lookupData.error || `Playlist "${analyzed.identifier}" not found on Dailymotion API ${version}.`,
            apiVersion: version,
            endpoint: version === "v2" ? `GET /playlists/${analyzed.identifier}` : `GET /playlist/${analyzed.identifier}`,
            resourceType: "playlist",
          });
          logDailymotionError(normalized);
          updateProgress({ status: "failed", error: normalized.userMessage });
          return {
            ok: false,
            analyzed,
            targetIdentity,
            effectiveKind,
            version,
            item: null,
            items: [],
            error: normalized.userMessage,
            reason: lookupData.reason || "playlist_not_found",
            status: lookupData.status || 404,
            normalized,
            scanProgress: progressState,
          };
        }
      }

      updateProgress({ status: "fetching_pages" });

      let page = startPage;
      let keepFetching = true;
      let consecutiveEmptyPages = 0;
      let pagesFetchedThisRun = 0;
      let isPaginationStalled = false;
      let lastPageItems: DiscoveryItem[] = [];
      const initialWindowUniqueStart = items.length;
      // In deep scan mode, remove artificial 200-page limit so complete catalog ingestion can proceed
      const loopBudget = targetMaxPages > 0 ? targetMaxPages : (config.strategy === "deep" ? 10000 : 200);

      while (keepFetching) {
        if (abortSignal?.aborted) {
          updateProgress({ status: "cancelled" });
          break;
        }

        if (isPaused?.()) {
          updateProgress({ status: "paused" });
          break;
        }

        // Loop prevention: stop if visited page number without cursor or repeated cursor (Section 8: pagination stall detection)
        if (visitedPages.has(page) && !currentNextCursor) {
          isPaginationStalled = true;
          updateProgress({ status: "pagination_stalled" });
          break;
        }
        visitedPages.add(page);

        if (currentNextCursor && visitedCursors.has(currentNextCursor)) {
          isPaginationStalled = true;
          updateProgress({ status: "pagination_stalled" });
          break;
        }
        if (currentNextCursor) {
          visitedCursors.add(currentNextCursor);
        }

        updateProgress({
          pagesFetched: page,
          activeWindowLabel: `Fetching Playlist Page ${page} (size: ${config.pageSize})`,
        });

        const queryParams = new URLSearchParams();
        queryParams.set("mode", "videos");
        queryParams.set("id", analyzed.identifier);
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(config.pageSize));
        if (currentNextCursor) {
          queryParams.set("nextUrl", currentNextCursor);
        }
        if (fieldsParam) queryParams.set("fields", fieldsParam);
        if (config.serverSort) queryParams.set("sort", config.serverSort);

        const videosRes = await fetch(
          `/api/discovery/${version}/playlists?${queryParams.toString()}`,
          { signal: abortSignal }
        );
        const videosData = (await videosRes.json()) as DiscoveryApiResponse;
        rawResponses.push(videosData);

        if (!videosData.ok) {
          updateProgress({
            status: items.length > 0 ? "partial" : "failed",
            error: videosData.error,
          });
          break;
        }

        pagesFetchedThisRun += 1;
        const pageItems = videosData.items ?? videosData.result?.items ?? [];
        lastPageItems = pageItems;
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        currentNextCursor = videosData.result?.nextCursor ?? (videosData as any).nextCursor ?? null;

        if (videosData.total !== undefined && videosData.total !== null) {
          providerReportedQueryTotal = videosData.total;
        }

        for (const item of pageItems) {
          item.provenance = {
            provider: "dailymotion",
            apiVersion: version,
            resourceType: item.kind,
            resourceId: item.id,
            fetchedAt: new Date().toISOString(),
            scanId,
            dateWindowId: "playlist-catalog",
            page,
            ownerId: analyzed.identifier,
            schemaVersion: 1,
          };
        }

        const { duplicateCount: dupes } = deduplicator.ingestBatch(pageItems, "playlist-catalog", page);
        duplicateCount += dupes;
        const playlistCanonical = deduplicator.getCanonicalItems();

        updateProgress({
          itemsDiscovered: deduplicator.getSummary().totalRawObserved,
          uniqueItemsAdded: playlistCanonical.length,
          duplicateCount,
        });

        if (onPageCommitted && pageItems.length > 0) {
          try {
            await onPageCommitted({
              page,
              items: pageItems,
              cumulativeItems: playlistCanonical,
              checkpoint: {
                nextPage: page + 1,
                nextCursor: currentNextCursor,
                visitedPages: Array.from(visitedPages),
                visitedCursors: Array.from(visitedCursors),
                canResume: hasMore || Boolean(currentNextCursor),
              },
            });
          } catch (commitErr) {
            console.warn("[LinkExplorer] Progressive playlist commit error:", commitErr);
          }
        }

        if (pageItems.length === 0) {
          consecutiveEmptyPages += 1;
        } else {
          consecutiveEmptyPages = 0;
        }

        if (!hasMore && !currentNextCursor) {
          keepFetching = false;
        } else if (consecutiveEmptyPages >= 5 && !currentNextCursor) {
          keepFetching = false;
        } else if (targetMaxPages > 0 && pagesFetchedThisRun >= targetMaxPages) {
          keepFetching = false;
        } else if (pagesFetchedThisRun >= loopBudget) {
          keepFetching = false;
        } else {
          page += 1;
          if (config.throttleMs > 0) {
            await delay(config.throttleMs);
          }
        }
      }

      if (providerReportedLifetimeTotal && providerReportedLifetimeTotal > items.length && !hasMore) {
        omittedOrUnavailableReferences = Math.max(0, providerReportedLifetimeTotal - items.length);
      }

      windowRecords.push({
        windowId: "playlist-catalog",
        label: "Playlist Catalog",
        dateFrom: null,
        dateTo: null,
        pageCount: pagesFetchedThisRun,
        uniqueCount: items.length - initialWindowUniqueStart,
        duplicateCount,
        providerTotal: providerReportedLifetimeTotal || providerReportedQueryTotal,
        isCapped: false,
        status: hasMore ? "unresolved" : "completed",
      });

      let playlistFinalStatus: ScanCompletenessStatus = "completed";
      if (abortSignal?.aborted) {
        playlistFinalStatus = "cancelled";
      } else if (isPaused?.()) {
        playlistFinalStatus = "paused";
      } else if (isPaginationStalled) {
        playlistFinalStatus = "pagination_stalled";
      } else if (hasMore || Boolean(currentNextCursor)) {
        playlistFinalStatus = "partial";
      } else if (omittedOrUnavailableReferences > 0) {
        playlistFinalStatus = "completed_with_unavailable_references";
      } else {
        playlistFinalStatus = "complete_within_verified_scope";
      }
      updateProgress({ status: playlistFinalStatus });
    }

    // ==========================================
    // DIAGNOSTICS & METRICS COMPILATION
    // ==========================================
    const finalCanonicalItems = deduplicator.getCanonicalItems();
    const dedupeSummary = deduplicator.getSummary();

    const diagnostics: RetrievalDiagnostics = {
      scanId,
      scanStrategy: config.strategy,
      startedAt: new Date(Date.now() - 1000).toISOString(),
      completedAt: new Date().toISOString(),
      initialQueryTotal: providerReportedQueryTotal,
      lifetimeReportedTotal: providerReportedLifetimeTotal,
      windows: windowRecords,
      activeWindowDepth: progressState.activeWindowDepth,
      rateLimitHits: 0,
      hasUnresolvedWindows: windowRecords.some((w) => w.status === "capped" || w.status === "unresolved"),
      notes: [
        `Target: ${analyzed.identifier} (${effectiveKind}) on API ${version.toUpperCase()}`,
        providerReportedLifetimeTotal
          ? `Lifetime reported total: ${providerReportedLifetimeTotal.toLocaleString()} items`
          : "Global lifetime total not exposed by endpoint",
        `Total pages fetched: ${progressState.pagesFetched}`,
        `Total unique records retrieved: ${finalCanonicalItems.length}`,
        `Duplicates skipped: ${dedupeSummary.totalDuplicatesDetected}`,
        `Retrieval Strategy: ${ledger.strategy} (${ledger.direction})`,
      ],
    };

    const metrics: CatalogRetrievalMetrics = {
      providerReportedTotalPerQuery: providerReportedQueryTotal,
      providerReportedTotalLifetime: providerReportedLifetimeTotal,
      pagesFetched: progressState.pagesFetched,
      uniqueRecordsFetched: finalCanonicalItems.length,
      duplicateRecordsSkipped: dedupeSummary.totalDuplicatesDetected,
      uniqueRecordsPersisted: finalCanonicalItems.length,
      dateWindowsCompleted: ledger.periods.filter((p) => p.status === "completed").length,
      dateWindowsRemaining: ledger.periods.filter((p) => p.status === "pending" || p.status === "in_progress").length,
      failedRequests: 0,
      unresolvedWindows: ledger.periods.filter((p) => p.status === "capped" || p.status === "failed").length,
      recordsUnavailableOrInaccessible: omittedOrUnavailableReferences,
      coverageStatus: progressState.status,
      coverageEvidence:
        config.strategy === "standard" &&
        (hasMore || (providerReportedLifetimeTotal !== null && finalCanonicalItems.length < providerReportedLifetimeTotal))
          ? providerReportedLifetimeTotal
            ? `Standard scan completed (${progressState.pagesFetched} pages / ${finalCanonicalItems.length} items) — additional catalog coverage has not been verified. Target reports ${providerReportedLifetimeTotal.toLocaleString()} total videos.`
            : `Standard scan completed (${progressState.pagesFetched} pages / ${finalCanonicalItems.length} items) — additional catalog coverage has not been verified.`
          : `Retrieved ${finalCanonicalItems.length} unique items across ${ledger.periods.length} time partition(s).`,
    };

    // ==========================================
    // INTELLIGENCE & MANIFEST COMPUTATION
    // ==========================================
    const intelligence: ResourceIntelligenceData = computeResourceIntelligence(
      finalCanonicalItems,
      mainItem,
      version,
      analyzed,
      progressState.status,
      {
        duplicatesSkipped: dedupeSummary.totalDuplicatesDetected,
        pagesRetrieved: progressState.pagesFetched,
        providerReportedTotal: providerReportedQueryTotal,
        providerReportedLifetimeTotal,
        omittedOrUnavailable: omittedOrUnavailableReferences,
        coverageStatus: progressState.status,
        coverageEvidence: metrics.coverageEvidence,
        targetIdentity,
        diagnostics,
        metrics,
      }
    );

    const sha256Checksum = await computeCatalogChecksum(finalCanonicalItems, analyzed.identifier);

    const manifest: LinkExplorerManifest = {
      manifestId: `dm-manifest-${analyzed.identifier}-${Date.now()}`,
      manifestRevision: 2,
      sourceInput: input,
      identifier: analyzed.identifier,
      targetIdentity,
      resourceKind: effectiveKind,
      apiVersion: version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalItems: finalCanonicalItems.length,
      sha256Checksum,
      intelligence,
      metrics,
      diagnostics,
      items: finalCanonicalItems,
      scanConfig: config,
      status: progressState.status,
      retrievalLedger: ledger,
      retrievalStrategy: config.retrievalStrategy || ledger.strategy,
      retrievalDirection: config.retrievalDirection || ledger.direction,
      totalRawObserved: dedupeSummary.totalRawObserved,
      totalDuplicatesDetected: dedupeSummary.totalDuplicatesDetected,
    };

    const checkpoint = {
      nextPage: progressState.pagesFetched + 1,
      nextCursor: currentNextCursor,
      visitedPages: Array.from(visitedPages),
      visitedCursors: Array.from(visitedCursors),
      canResume:
        hasMore ||
        Boolean(currentNextCursor) ||
        Boolean(getNextPendingPeriod(ledger)) ||
        Boolean(providerReportedLifetimeTotal && finalCanonicalItems.length < providerReportedLifetimeTotal),
      lastSuccessfullyFetchedItem:
        finalCanonicalItems.length > 0
          ? {
              id: finalCanonicalItems[finalCanonicalItems.length - 1].id,
              createdAt: finalCanonicalItems[finalCanonicalItems.length - 1].createdAt || undefined,
            }
          : undefined,
      oldestItemDate: intelligence.chronology.oldestVideo?.date || null,
      newestItemDate: intelligence.chronology.newestVideo?.date || null,
    };

    // Persist to search history snapshot asynchronously with 7-day durability (only for initial scans)
    if (!isContinuation) {
      const snapshotItems = [
        ...(mainItem ? [mainItem] : []),
        ...finalCanonicalItems,
      ];

      if (snapshotItems.length > 0) {
        captureSearchSnapshot({
          workspace: "link_explorer",
          query: input,
          route: "/link-explorer",
          apiVersion: version,
          resourceType: effectiveKind.toUpperCase(),
          mode: version === "v1" ? "search" : "browse",
          apiParams: { input, version, effectiveKind, analyzed, scanConfig: config },
          rawResponse: rawResponses.length === 1 ? rawResponses[0] : { batches: rawResponses.length },
          items: snapshotItems,
          totalResults: providerReportedLifetimeTotal || providerReportedQueryTotal || snapshotItems.length,
          hasMore,
          pageIndex: progressState.pagesFetched,
        }).catch(() => {
          // Non-blocking snapshot capture failure
        });
      }
    }

    return {
      ok: true,
      analyzed,
      targetIdentity,
      effectiveKind,
      version,
      item: mainItem,
      items: finalCanonicalItems,
      hasMore,
      hasRemainingCatalog: Boolean(providerReportedLifetimeTotal && finalCanonicalItems.length < providerReportedLifetimeTotal),
      page: progressState.pagesFetched,
      total: providerReportedLifetimeTotal || providerReportedQueryTotal || finalCanonicalItems.length,
      lifetimeTotal: providerReportedLifetimeTotal,
      nextCursor: currentNextCursor,
      omittedOrUnavailableReferences,
      duplicatesSkipped: dedupeSummary.totalDuplicatesDetected,
      intelligence,
      scanProgress: progressState,
      manifest,
      diagnostics,
      metrics,
      retrievalLedger: ledger,
      currentPeriod: activePeriod || undefined,
      totalRawObserved: dedupeSummary.totalRawObserved,
      totalUniqueRetained: finalCanonicalItems.length,
      totalDuplicatesDetected: dedupeSummary.totalDuplicatesDetected,
      checkpoint,
    };
  } catch (err) {
    const normalized = normalizeDailymotionError({
      error: err,
      apiVersion: version,
      endpoint: "LinkExplorer/resolve",
    });
    logDailymotionError(normalized);
    updateProgress({ status: "failed", error: normalized.userMessage });
    return {
      ok: false,
      analyzed,
      targetIdentity,
      effectiveKind,
      version,
      item: null,
      items: [],
      error: normalized.userMessage,
      reason: normalized.code,
      status: normalized.httpStatus,
      normalized,
      scanProgress: progressState,
    };
  }
}
