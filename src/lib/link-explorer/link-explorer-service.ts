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
  type LinkExplorerManifest,
  type LinkExplorerResolution,
  type ResourceIntelligenceData,
  type ScanBudgetConfig,
  type ScanCompletenessStatus,
  type ScanProgressState,
  type ScanStrategy,
} from "./link-explorer-types";

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
  pageSize: 50,
  maxPages: 5,
  throttleMs: 150,
  fieldsProfile: "standard",
};

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

  // Version 2 REST fields
  switch (profile) {
    case "basic":
      return "video_id,title,created_at";
    case "extended":
      return "video_id,title,description,created_at,duration,views_total,likes_total,category,country,language,tags,aspect_ratio,embed_url,owner";
    case "standard":
    default:
      return "video_id,title,description,created_at,duration,views_total,owner";
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
  abortSignal?: AbortSignal
): Promise<LinkExplorerResolution> {
  const analyzed = analyzeDailymotionUrlOrId(input);

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
      effectiveKind: "unsupported",
      version,
      item: null,
      items: [],
      error: normalized.userMessage,
      reason: "user_input_error",
      normalized,
    };
  }

  const effectiveKind =
    overrideKind && overrideKind !== "unsupported" ? overrideKind : analyzed.kind;

  // 100% Strict Architectural Separation: Keyword queries belong to Global Search
  if (effectiveKind === "search") {
    return {
      ok: false,
      analyzed,
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
  if (config.strategy === "quick") {
    targetMaxPages = 1;
  } else if (config.strategy === "standard") {
    targetMaxPages = Math.min(config.maxPages || 5, 10);
  } else if (config.strategy === "deep") {
    targetMaxPages = config.maxPages || 0; // 0 = unlimited pagination
  }

  const progressState: ScanProgressState = {
    status: "discovering",
    strategy: config.strategy,
    pagesFetched: 0,
    totalPagesEstimated: null,
    itemsDiscovered: 0,
    uniqueItemsAdded: 0,
    duplicateCount: 0,
    activeWindowLabel: null,
    activeWindowDepth: 0,
    currentRateThrottleMs: config.throttleMs,
    error: null,
    canResume: false,
  };

  const updateProgress = (partial: Partial<ScanProgressState>) => {
    Object.assign(progressState, partial);
    if (onProgress) {
      onProgress({ ...progressState });
    }
  };

  updateProgress({ status: "discovering" });

  try {
    let mainItem: DiscoveryItem | null = null;
    const items: DiscoveryItem[] = [];
    const seenCompositeKeys = new Set<string>();
    let hasMore = false;
    let providerReportedTotal = 0;
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
        items.push(mainItem);
        seenCompositeKeys.add(discoveryCompositeKey(mainItem.apiVersion, mainItem.kind, mainItem.id));
      }
      updateProgress({
        status: "completed",
        pagesFetched: 1,
        itemsDiscovered: items.length,
        uniqueItemsAdded: items.length,
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
        items.push(mainItem);
        seenCompositeKeys.add(discoveryCompositeKey(mainItem.apiVersion, mainItem.kind, mainItem.id));
      }
      updateProgress({
        status: "completed",
        pagesFetched: 1,
        itemsDiscovered: items.length,
        uniqueItemsAdded: items.length,
      });
    }

    // ==========================================
    // CASE 3: CHANNEL / PROFILE / USER CATALOG
    // ==========================================
    else if (effectiveKind === "channel" || effectiveKind === "profile" || effectiveKind === "user") {
      // 1. First fetch profile metadata
      updateProgress({ status: "discovering", activeWindowLabel: "Fetching Profile Metadata" });
      const lookupRes = await fetch(
        `/api/discovery/${version}/channels?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`,
        { signal: abortSignal }
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponses.push(lookupData);

      if (lookupData.ok) {
        mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      }

      const totalVideosReported = mainItem?.extra?.videos_total !== undefined
        ? Number(mainItem.extra.videos_total)
        : null;

      if (totalVideosReported && !Number.isNaN(totalVideosReported)) {
        providerReportedTotal = totalVideosReported;
        const estPages = Math.ceil(totalVideosReported / config.pageSize);
        updateProgress({
          totalPagesEstimated: targetMaxPages > 0 ? Math.min(estPages, targetMaxPages) : estPages,
        });
      }

      // 2. Multi-page catalog pagination engine
      updateProgress({ status: "fetching_pages" });

      let page = 1;
      let keepFetching = true;
      let reachedWindowCap = false;

      while (keepFetching) {
        if (abortSignal?.aborted) {
          updateProgress({ status: "interrupted" });
          break;
        }

        updateProgress({
          pagesFetched: page,
          activeWindowLabel: `Fetching Page ${page} (size: ${config.pageSize})`,
        });

        // Build request parameters respecting V1 vs V2 capability
        const queryParams = new URLSearchParams();
        queryParams.set("mode", "videos");
        queryParams.set("owner", analyzed.identifier);
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(config.pageSize));

        if (fieldsParam) {
          queryParams.set("fields", fieldsParam);
        }

        // Server-side sort support
        if (config.serverSort) {
          queryParams.set("sort", config.serverSort);
        }

        // Date boundaries
        if (config.dateFrom) queryParams.set("createdAfter", config.dateFrom);
        if (config.dateTo) queryParams.set("createdBefore", config.dateTo);

        const videosRes = await fetch(
          `/api/discovery/${version}/channels?${queryParams.toString()}`,
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

        const pageItems = videosData.items ?? videosData.result?.items ?? [];
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        if (videosData.total !== undefined && videosData.total !== null) {
          providerReportedTotal = videosData.total;
        }

        let duplicatesInPage = 0;
        for (const item of pageItems) {
          const cKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
          if (seenCompositeKeys.has(cKey)) {
            duplicatesInPage += 1;
          } else {
            seenCompositeKeys.add(cKey);
            items.push(item);
          }
        }

        updateProgress({
          itemsDiscovered: items.length + duplicatesInPage,
          uniqueItemsAdded: items.length,
          duplicateCount: progressState.duplicateCount + duplicatesInPage,
        });

        // Check window cap (Dailymotion caps pagination at 1000 items per query window)
        const totalConsumed = page * config.pageSize;
        if (totalConsumed >= 1000 && hasMore) {
          reachedWindowCap = true;
        }

        // Check exit conditions
        if (!hasMore || pageItems.length === 0) {
          keepFetching = false;
        } else if (targetMaxPages > 0 && page >= targetMaxPages) {
          keepFetching = false;
        } else if (reachedWindowCap && config.strategy !== "deep") {
          // Standard/quick scan stops at 1000 items cap
          keepFetching = false;
        } else {
          page += 1;
          if (config.throttleMs > 0) {
            await delay(config.throttleMs);
          }
        }
      }

      // ==========================================
      // DEEP CATALOG RECURSIVE DATE-WINDOW PARTITIONING
      // If channel has > 1,000 items and deep scan is active
      // ==========================================
      if (
        config.strategy === "deep" &&
        reachedWindowCap &&
        !abortSignal?.aborted &&
        (!targetMaxPages || targetMaxPages > page)
      ) {
        updateProgress({
          status: "splitting_date_ranges",
          activeWindowLabel: "Splitting into Year Windows (bypassing 1,000-item cap)",
        });

        // Determine earliest year: registration year or default 2005
        let startYear = 2005;
        if (mainItem?.createdAt) {
          const yr = new Date(mainItem.createdAt).getUTCFullYear();
          if (!Number.isNaN(yr) && yr >= 2005) startYear = yr;
        }
        const currentYear = new Date().getUTCFullYear();

        // Iterate backwards from current year down to start year
        for (let yr = currentYear; yr >= startYear; yr--) {
          if (abortSignal?.aborted) break;
          if (targetMaxPages > 0 && page >= targetMaxPages) break;

          const yearStart = `${yr}-01-01`;
          const yearEnd = `${yr}-12-31`;

          updateProgress({
            activeWindowLabel: `Partition: Year ${yr} (${yearStart} -> ${yearEnd})`,
            activeWindowDepth: 1,
          });

          let yearPage = 1;
          let yearHasMore = true;

          while (yearHasMore && (!targetMaxPages || page < targetMaxPages)) {
            if (abortSignal?.aborted) break;

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

            let yrDupes = 0;
            for (const item of yrItems) {
              const cKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
              if (seenCompositeKeys.has(cKey)) {
                yrDupes += 1;
              } else {
                seenCompositeKeys.add(cKey);
                items.push(item);
              }
            }

            page += 1;
            yearPage += 1;
            updateProgress({
              pagesFetched: page,
              itemsDiscovered: items.length + yrDupes,
              uniqueItemsAdded: items.length,
              duplicateCount: progressState.duplicateCount + yrDupes,
            });

            if (yrItems.length === 0 || !yearHasMore || yearPage > 10) {
              break;
            }

            if (config.throttleMs > 0) {
              await delay(config.throttleMs);
            }
          }
        }
      }

      const finalStatus: ScanCompletenessStatus = abortSignal?.aborted
        ? "interrupted"
        : reachedWindowCap && items.length < (providerReportedTotal || 0)
        ? "completed_with_known_limitations"
        : "completed";

      updateProgress({ status: finalStatus });
    }

    // ==========================================
    // CASE 4: PLAYLIST EXPLORER & CATALOG
    // ==========================================
    else if (effectiveKind === "playlist") {
      updateProgress({ status: "discovering", activeWindowLabel: "Fetching Playlist Metadata" });
      const lookupRes = await fetch(
        `/api/discovery/${version}/playlists?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`,
        { signal: abortSignal }
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponses.push(lookupData);

      if (lookupData.ok) {
        mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      }

      updateProgress({ status: "fetching_pages" });

      let page = 1;
      let keepFetching = true;

      while (keepFetching) {
        if (abortSignal?.aborted) {
          updateProgress({ status: "interrupted" });
          break;
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
        if (fieldsParam) queryParams.set("fields", fieldsParam);

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

        const pageItems = videosData.items ?? videosData.result?.items ?? [];
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        if (videosData.total !== undefined && videosData.total !== null) {
          providerReportedTotal = videosData.total;
        }

        let dupes = 0;
        for (const item of pageItems) {
          const cKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
          if (seenCompositeKeys.has(cKey)) {
            dupes += 1;
          } else {
            seenCompositeKeys.add(cKey);
            items.push(item);
          }
        }

        updateProgress({
          itemsDiscovered: items.length + dupes,
          uniqueItemsAdded: items.length,
          duplicateCount: progressState.duplicateCount + dupes,
        });

        // SPECIAL V2 PLAYLIST HANDLING:
        // Do NOT stop simply because pageItems.length < config.pageSize if hasMore is true!
        // Unavailable/deleted videos in Dailymotion playlists are filtered out, resulting in
        // page sizes smaller than requested while further pages still exist.
        if (!hasMore || pageItems.length === 0) {
          keepFetching = false;
        } else if (targetMaxPages > 0 && page >= targetMaxPages) {
          keepFetching = false;
        } else {
          page += 1;
          if (config.throttleMs > 0) {
            await delay(config.throttleMs);
          }
        }
      }

      updateProgress({ status: abortSignal?.aborted ? "interrupted" : "completed" });
    }

    // ==========================================
    // INTELLIGENCE & MANIFEST COMPUTATION
    // ==========================================
    const intelligence: ResourceIntelligenceData = computeResourceIntelligence(
      items,
      mainItem,
      version,
      analyzed,
      progressState.status
    );

    const sha256Checksum = await computeCatalogChecksum(items, analyzed.identifier);

    const manifest: LinkExplorerManifest = {
      manifestId: `dm-manifest-${analyzed.identifier}-${Date.now()}`,
      sourceInput: input,
      identifier: analyzed.identifier,
      resourceKind: effectiveKind,
      apiVersion: version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalItems: items.length,
      sha256Checksum,
      intelligence,
      items,
      scanConfig: config,
      status: progressState.status,
    };

    // Persist to search history snapshot asynchronously with 7-day durability
    const snapshotItems = [
      ...(mainItem ? [mainItem] : []),
      ...items,
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
        totalResults: providerReportedTotal || snapshotItems.length,
        hasMore,
        pageIndex: progressState.pagesFetched,
      }).catch(() => {
        // Non-blocking snapshot capture failure
      });
    }

    return {
      ok: true,
      analyzed,
      effectiveKind,
      version,
      item: mainItem,
      items,
      hasMore,
      page: progressState.pagesFetched,
      total: providerReportedTotal || items.length,
      intelligence,
      scanProgress: progressState,
      manifest,
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
