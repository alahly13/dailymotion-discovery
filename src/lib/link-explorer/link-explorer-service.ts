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
  type ContinuationState,
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
  pageSize: 100,
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
  abortSignal?: AbortSignal,
  continuationState?: ContinuationState
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

  const isContinuation = Boolean(continuationState);
  const items: DiscoveryItem[] = continuationState?.existingItems ? [...continuationState.existingItems] : [];
  const seenCompositeKeys = new Set<string>(
    items.map((it) => discoveryCompositeKey(it.apiVersion, it.kind, it.id))
  );
  let duplicateCount = continuationState?.existingDuplicates ?? 0;
  let providerReportedTotal = continuationState?.providerReportedTotal ?? 0;
  let omittedOrUnavailableReferences = continuationState?.omittedOrUnavailableReferences ?? 0;
  const visitedPages = new Set<number>(continuationState?.visitedPages ?? []);
  const visitedCursors = new Set<string>(continuationState?.visitedCursors ?? []);
  const startPage = continuationState?.startPage ?? 1;
  let currentNextCursor: string | null = continuationState?.nextCursor ?? null;

  const progressState: ScanProgressState = {
    status: isContinuation ? "fetching_pages" : "discovering",
    strategy: config.strategy,
    pagesFetched: isContinuation ? Math.max(0, startPage - 1) : 0,
    totalPagesEstimated: null,
    itemsDiscovered: items.length + duplicateCount,
    uniqueItemsAdded: items.length,
    duplicateCount,
    activeWindowLabel: null,
    activeWindowDepth: 0,
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
      if (!isContinuation) {
        // 1. Fetch profile metadata
        updateProgress({ status: "discovering", activeWindowLabel: "Fetching Profile Metadata" });
        const lookupRes = await fetch(
          `/api/discovery/${version}/channels?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`,
          { signal: abortSignal }
        );
        const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
        rawResponses.push(lookupData);

        if (lookupData.ok) {
          mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
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

      const totalVideosReported =
        mainItem?.extra?.videos_total !== undefined ? Number(mainItem.extra.videos_total) : null;

      if (totalVideosReported && !Number.isNaN(totalVideosReported)) {
        providerReportedTotal = totalVideosReported;
        const estPages = Math.ceil(totalVideosReported / config.pageSize);
        updateProgress({
          totalPagesEstimated: targetMaxPages > 0 ? Math.min(estPages, targetMaxPages) : estPages,
        });
      }

      // 2. Multi-page catalog pagination engine
      updateProgress({ status: "fetching_pages" });

      let page = startPage;
      let keepFetching = true;
      let reachedWindowCap = false;
      let pagesFetchedThisRun = 0;
      const loopBudget = targetMaxPages > 0 ? targetMaxPages : 50;

      while (keepFetching) {
        if (abortSignal?.aborted) {
          updateProgress({ status: "interrupted" });
          break;
        }

        // Loop prevention: stop if visited page number without cursor or visited cursor
        if (visitedPages.has(page) && !currentNextCursor) {
          updateProgress({ status: "completed_with_known_limitations" });
          break;
        }
        visitedPages.add(page);

        if (currentNextCursor && visitedCursors.has(currentNextCursor)) {
          updateProgress({ status: "completed_with_known_limitations" });
          break;
        }
        if (currentNextCursor) {
          visitedCursors.add(currentNextCursor);
        }

        updateProgress({
          pagesFetched: page,
          activeWindowLabel: `Fetching Channel Page ${page} (size: ${config.pageSize})`,
        });

        // Build request parameters respecting V1 vs V2 capability
        const queryParams = new URLSearchParams();
        queryParams.set("mode", "videos");
        queryParams.set("owner", analyzed.identifier);
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

        pagesFetchedThisRun += 1;
        const pageItems = videosData.items ?? videosData.result?.items ?? [];
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        currentNextCursor = videosData.result?.nextCursor ?? (videosData as any).nextCursor ?? null;

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
        duplicateCount += duplicatesInPage;

        updateProgress({
          itemsDiscovered: items.length + duplicateCount,
          uniqueItemsAdded: items.length,
          duplicateCount,
        });

        // Check window cap (Dailymotion caps pagination at 1000 items per query window)
        const totalConsumed = page * config.pageSize;
        if ((totalConsumed >= 1000 || (version === "v1" && page >= 10)) && hasMore) {
          reachedWindowCap = true;
        }

        // Check exit conditions
        if (!hasMore || pageItems.length === 0) {
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

      // ==========================================
      // DEEP CATALOG RECURSIVE DATE-WINDOW PARTITIONING
      // If channel has > 1,000 items and deep scan is active (Recursive Year -> Month)
      // ==========================================
      if (
        config.strategy === "deep" &&
        reachedWindowCap &&
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
          if (abortSignal?.aborted) break;
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

          while (yearHasMore && (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)) {
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
            duplicateCount += yrDupes;

            page += 1;
            pagesFetchedThisRun += 1;
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

          // Recursive month sub-partitioning if year exceeds 1,000 items
          if (yearCapped && !abortSignal?.aborted && (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)) {
            updateProgress({
              activeWindowLabel: `Sub-Partitioning Year ${yr} into 12 Monthly Windows`,
              activeWindowDepth: 2,
            });

            for (let m = 12; m >= 1; m--) {
              if (abortSignal?.aborted) break;
              if (targetMaxPages > 0 && pagesFetchedThisRun >= targetMaxPages) break;

              const mStr = String(m).padStart(2, "0");
              const lastDay = new Date(yr, m, 0).getDate();
              const monthStart = `${yr}-${mStr}-01`;
              const monthEnd = `${yr}-${mStr}-${String(lastDay).padStart(2, "0")}`;

              let mPage = 1;
              let mHasMore = true;

              while (mHasMore && (!targetMaxPages || pagesFetchedThisRun < targetMaxPages)) {
                if (abortSignal?.aborted) break;

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

                let mDupes = 0;
                for (const item of mItems) {
                  const cKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
                  if (seenCompositeKeys.has(cKey)) {
                    mDupes += 1;
                  } else {
                    seenCompositeKeys.add(cKey);
                    items.push(item);
                  }
                }
                duplicateCount += mDupes;

                page += 1;
                pagesFetchedThisRun += 1;
                mPage += 1;

                updateProgress({
                  pagesFetched: page,
                  itemsDiscovered: items.length + duplicateCount,
                  uniqueItemsAdded: items.length,
                  duplicateCount,
                });

                if (mItems.length === 0 || !mHasMore || mPage > 10) break;
                if (config.throttleMs > 0) await delay(config.throttleMs);
              }
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
          if (mainItem?.extra?.videos_total !== undefined && mainItem.extra.videos_total !== null) {
            const parsed = Number(mainItem.extra.videos_total);
            if (!Number.isNaN(parsed)) providerReportedTotal = parsed;
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
      const loopBudget = targetMaxPages > 0 ? targetMaxPages : 50;

      while (keepFetching) {
        if (abortSignal?.aborted) {
          updateProgress({ status: "interrupted" });
          break;
        }

        // Loop prevention
        if (visitedPages.has(page) && !currentNextCursor) {
          updateProgress({ status: "completed_with_known_limitations" });
          break;
        }
        visitedPages.add(page);

        if (currentNextCursor && visitedCursors.has(currentNextCursor)) {
          updateProgress({ status: "completed_with_known_limitations" });
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
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        currentNextCursor = videosData.result?.nextCursor ?? (videosData as any).nextCursor ?? null;

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
        duplicateCount += dupes;

        updateProgress({
          itemsDiscovered: items.length + duplicateCount,
          uniqueItemsAdded: items.length,
          duplicateCount,
        });

        if (pageItems.length === 0) {
          consecutiveEmptyPages += 1;
        } else {
          consecutiveEmptyPages = 0;
        }

        // SPECIAL V2 PLAYLIST HANDLING:
        // Do NOT stop simply because pageItems.length < config.pageSize or pageItems.length === 0!
        // Unavailable/deleted videos in Dailymotion playlists are filtered out, resulting in
        // page sizes smaller than requested or even 0 while further pages still exist.
        if (!hasMore && !currentNextCursor) {
          keepFetching = false;
        } else if (consecutiveEmptyPages >= 5) {
          // Safe circuit breaker against infinite 0-item loops
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

      // Compute omitted or unavailable references count if provider reported total exceeds retrieved unique items
      if (providerReportedTotal > 0 && providerReportedTotal > items.length && !hasMore) {
        omittedOrUnavailableReferences = Math.max(0, providerReportedTotal - items.length);
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
      progressState.status,
      {
        duplicatesSkipped: duplicateCount,
        pagesRetrieved: progressState.pagesFetched,
        providerReportedTotal: providerReportedTotal || null,
        omittedOrUnavailable: omittedOrUnavailableReferences,
      }
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

    const checkpoint = {
      nextPage: progressState.pagesFetched + 1,
      nextCursor: currentNextCursor,
      visitedPages: Array.from(visitedPages),
      visitedCursors: Array.from(visitedCursors),
      canResume: hasMore || Boolean(currentNextCursor),
    };

    // Persist to search history snapshot asynchronously with 7-day durability (only for initial scans)
    if (!isContinuation) {
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
      nextCursor: currentNextCursor,
      omittedOrUnavailableReferences,
      duplicatesSkipped: duplicateCount,
      intelligence,
      scanProgress: progressState,
      manifest,
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
