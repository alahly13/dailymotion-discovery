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

      // Attempt to fetch related videos for context
      try {
        const relatedRes = await fetch(
          `/api/discovery/${version}/videos?mode=related&id=${encodeURIComponent(analyzed.identifier)}&pageSize=8`
        );
        const relatedData = (await relatedRes.json()) as DiscoveryApiResponse;
        if (relatedData.ok) {
          relatedItems = relatedData.items ?? relatedData.result?.items ?? [];
        }
      } catch {
        // Non-fatal related items
      }
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
      // V2 strict architectural isolation: V2 does not have global search.
      // Never silently fall back to V1 when V2 is explicitly requested!
      if (version === "v2") {
        const normalized = normalizeDailymotionError({
          customCode: "APP_UNSUPPORTED_RESOURCE",
          customMessage: "Dailymotion API v2 does not support global keyword search across all videos. All v2 catalog searches are profile-scoped. Switch to API v1 for global keyword search, or supply a channel/profile URL.",
          apiVersion: "v2",
          endpoint: "LinkExplorer/search",
          resourceType: "search",
        });
        return {
          ok: false,
          analyzed,
          effectiveKind: "search",
          version: "v2",
          item: null,
          items: [],
          error: "Dailymotion API v2 does not support global keyword search across all videos. Switch to API v1 for global search, or provide a channel/profile URL.",
          reason: "unsupported_operation",
          normalized,
        };
      }

      const searchRes = await fetch(
        `/api/discovery/v1/general?q=${encodeURIComponent(analyzed.identifier)}&pageSize=24`
      );
      const searchData = (await searchRes.json()) as DiscoveryApiResponse;
      rawResponse = searchData;

      if (!searchData.ok) {
        const normalized = normalizeDailymotionError({
          status: searchData.status,
          customMessage: searchData.error,
          apiVersion: "v1",
          endpoint: "GET /videos?search",
          resourceType: "search",
        });
        logDailymotionError(normalized);
        return {
          ok: false,
          analyzed,
          effectiveKind,
          version: "v1",
          item: null,
          items: [],
          error: searchData.error || `Failed to search "${analyzed.identifier}" on API v1.`,
          reason: searchData.reason,
          status: searchData.status,
          normalized,
        };
      }

      items = searchData.items ?? searchData.result?.items ?? [];
      hasMore = Boolean(searchData.hasMore ?? searchData.result?.hasMore);
      total = searchData.total ?? searchData.result?.total ?? items.length;
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
