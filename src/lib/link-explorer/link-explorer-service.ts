// Link Explorer Service — Universal Dailymotion URL & Identifier Resolution Engine
//
// What this controls: Client-side resolution of analyzed Dailymotion links and IDs,
// coordinating metadata lookup and catalog fetching across Legacy API v1 and REST API v2.
// Why it exists: Consolidates separate resource lookups into a unified strategy,
// captures search history snapshots for offline replay, and enforces zero-binary downloads.
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
}

export async function resolveLinkExplorerInput(
  input: string,
  version: ApiVersion = "v1",
  overrideKind?: DailymotionResourceKind,
  page: number = 1
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

  try {
    let mainItem: DiscoveryItem | null = null;
    let items: DiscoveryItem[] = [];
    let relatedItems: DiscoveryItem[] = [];
    let hasMore = false;
    let total = 0;
    let rawResponse: unknown = null;

    if (effectiveKind === "video") {
      const lookupRes = await fetch(
        `/api/discovery/${version}/videos?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponse = lookupData;

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
        };
      }

      mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      items = mainItem ? [mainItem] : [];
    } else if (effectiveKind === "channel" || effectiveKind === "profile" || effectiveKind === "user") {
      // Lookup channel metadata
      const lookupRes = await fetch(
        `/api/discovery/${version}/channels?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponse = lookupData;

      if (lookupData.ok) {
        mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      }

      // Fetch channel videos catalog
      const videosRes = await fetch(
        `/api/discovery/${version}/channels?mode=videos&owner=${encodeURIComponent(analyzed.identifier)}&pageSize=24&page=${page}`
      );
      const videosData = (await videosRes.json()) as DiscoveryApiResponse;
      if (videosData.ok) {
        items = videosData.items ?? videosData.result?.items ?? [];
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        total = videosData.total ?? videosData.result?.total ?? items.length;
      }
    } else if (effectiveKind === "playlist") {
      // Lookup playlist metadata
      const lookupRes = await fetch(
        `/api/discovery/${version}/playlists?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponse = lookupData;

      if (lookupData.ok) {
        mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
      }

      // Fetch playlist videos
      const videosRes = await fetch(
        `/api/discovery/${version}/playlists?mode=videos&id=${encodeURIComponent(analyzed.identifier)}&pageSize=50&page=${page}`
      );
      const videosData = (await videosRes.json()) as DiscoveryApiResponse;
      if (videosData.ok) {
        items = videosData.items ?? videosData.result?.items ?? [];
        hasMore = Boolean(videosData.hasMore ?? videosData.result?.hasMore);
        total = videosData.total ?? videosData.result?.total ?? items.length;
      }
    } else if (effectiveKind === "livestream") {
      const lookupRes = await fetch(
        `/api/discovery/${version}/live?mode=lookup&id=${encodeURIComponent(analyzed.identifier)}`
      );
      const lookupData = (await lookupRes.json()) as DiscoveryApiResponse;
      rawResponse = lookupData;

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
        };
      }
      mainItem = lookupData.item ?? lookupData.result?.items?.[0] ?? lookupData.items?.[0] ?? null;
    } else if (effectiveKind === "search") {
      // 100% Strict Architectural Separation: Link Explorer does NOT execute general catalog searches.
      // Keyword searches belong strictly to Global Search (/global-search).
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

    // Persist to search history snapshot asynchronously
    const snapshotItems = [
      ...(mainItem ? [mainItem] : []),
      ...items,
      ...relatedItems,
    ];

    if (snapshotItems.length > 0) {
      captureSearchSnapshot({
        query: input,
        route: "/link-explorer",
        apiVersion: version,
        resourceType: effectiveKind,
        mode: "resolve",
        apiParams: { input, version, effectiveKind, analyzed },
        rawResponse: rawResponse ?? {},
        items: snapshotItems,
        totalResults: total || snapshotItems.length,
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
      relatedItems,
      hasMore,
      page,
      total,
    };
  } catch (err) {
    const normalized = normalizeDailymotionError({
      error: err,
      apiVersion: version,
      endpoint: "LinkExplorer/resolve",
    });
    logDailymotionError(normalized);
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
    };
  }
}
