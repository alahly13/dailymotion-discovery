// Dailymotion URL and Resource Identifier Analyzer
//
// What this controls: Universal parsing and validation of Dailymotion URLs, handles,
// and resource identifiers for the Link Explorer and Channel Explorer engines.
// Why it exists: Prevents SSRF attacks via domain allowlist checks, maps ambiguous inputs
// to deterministic API paths across both Legacy API v1 and REST API v2, and provides
// typed metadata strategies for UI workspaces without scraping.
// Scope: Link Explorer (/link-explorer), Channel Explorer (/channel-explorer), and related API routes.

import type { ChannelSourceType } from "@/types/manifest";

export type DailymotionResourceKind =
  | "video"
  | "channel"
  | "profile"
  | "user"
  | "playlist"
  | "livestream"
  | "search"
  | "unsupported";

export interface DailymotionAnalyzedLink {
  kind: DailymotionResourceKind;
  rawInput: string;
  identifier: string;
  canonicalUrl: string | null;
  apiPathV1: string | null;
  apiPathV2: string | null;
  displayLabel: string;
  playlistId?: string | null;
  videoId?: string | null;
  reason?: string;
  warnings: Array<{ code: string; message: string }>;
}

export interface DailymotionChannelAnalysis {
  sourceType: ChannelSourceType;
  sourceInput: string;
  resolvedIdentifier: string;
  apiPath: string;
  displayLabel: string;
}

export function cleanIdentifier(value: string): string {
  return value.trim().replace(/^@/, "").replace(/^\/+|\/+$/g, "");
}

/**
 * Domain allowlist to prevent SSRF vulnerabilities and unwanted external redirects.
 */
const ALLOWED_HOSTS = new Set([
  "dailymotion.com",
  "www.dailymotion.com",
  "touch.dailymotion.com",
  "partner.dailymotion.com",
  "api.dailymotion.com",
  "dai.ly",
]);

function isAllowedHost(host: string): boolean {
  const cleanHost = host.toLowerCase().replace(/:\d+$/, "");
  if (ALLOWED_HOSTS.has(cleanHost)) return true;
  return cleanHost.endsWith(".dailymotion.com") || cleanHost.endsWith(".dai.ly");
}

/**
 * Universal Dailymotion URL and identifier analyzer.
 * Accepts any Dailymotion link, handle, or resource ID and maps it to
 * canonical URLs and v1/v2 API targets.
 */
export function analyzeDailymotionUrlOrId(input: string): DailymotionAnalyzedLink {
  const rawInput = (input ?? "").trim();
  const warnings: Array<{ code: string; message: string }> = [];

  if (!rawInput) {
    return {
      kind: "unsupported",
      rawInput,
      identifier: "",
      canonicalUrl: null,
      apiPathV1: null,
      apiPathV2: null,
      displayLabel: "Empty input",
      reason: "Please enter a Dailymotion URL, video ID, channel handle, or playlist ID.",
      warnings,
    };
  }

  // Handle explicit type prefixes: video:id, playlist:id, channel:id, etc.
  const prefixMatch = rawInput.match(/^(video|playlist|channel|user|profile|live):(.+)$/i);
  if (prefixMatch) {
    const rawKind = prefixMatch[1]!.toLowerCase();
    const cleanId = cleanIdentifier(prefixMatch[2]!);
    if (rawKind === "video") {
      return {
        kind: "video",
        rawInput,
        identifier: cleanId,
        videoId: cleanId,
        canonicalUrl: `https://www.dailymotion.com/video/${cleanId}`,
        apiPathV1: `/video/${cleanId}`,
        apiPathV2: `/v2/videos/${cleanId}`,
        displayLabel: `Video ${cleanId}`,
        warnings,
      };
    }
    if (rawKind === "playlist") {
      return {
        kind: "playlist",
        rawInput,
        identifier: cleanId,
        playlistId: cleanId,
        canonicalUrl: `https://www.dailymotion.com/playlist/${cleanId}`,
        apiPathV1: `/playlist/${cleanId}/videos`,
        apiPathV2: `/v2/playlists/${cleanId}`,
        displayLabel: `Playlist ${cleanId}`,
        warnings,
      };
    }
    if (rawKind === "channel" || rawKind === "profile") {
      return {
        kind: rawKind === "profile" ? "profile" : "channel",
        rawInput,
        identifier: cleanId,
        canonicalUrl: `https://www.dailymotion.com/${cleanId}`,
        apiPathV1: `/user/${cleanId}/videos`,
        apiPathV2: `/v2/profiles/${cleanId}/videos`,
        displayLabel: `Channel ${cleanId}`,
        warnings,
      };
    }
    if (rawKind === "user") {
      return {
        kind: "user",
        rawInput,
        identifier: cleanId,
        canonicalUrl: `https://www.dailymotion.com/user/${cleanId}`,
        apiPathV1: `/user/${cleanId}/videos`,
        apiPathV2: `/v2/profiles/${cleanId}/videos`,
        displayLabel: `User ${cleanId}`,
        warnings,
      };
    }
    if (rawKind === "live") {
      return {
        kind: "livestream",
        rawInput,
        identifier: cleanId,
        canonicalUrl: `https://www.dailymotion.com/live/${cleanId}`,
        apiPathV1: `/video/${cleanId}`,
        apiPathV2: `/v2/livestreams/${cleanId}`,
        displayLabel: `Livestream ${cleanId}`,
        warnings,
      };
    }
  }

  // Handle URL inputs
  let url: URL | null = null;
  if (/^https?:\/\//i.test(rawInput)) {
    try {
      url = new URL(rawInput);
    } catch {
      return {
        kind: "unsupported",
        rawInput,
        identifier: "",
        canonicalUrl: null,
        apiPathV1: null,
        apiPathV2: null,
        displayLabel: "Invalid URL",
        reason: "The provided URL is malformed.",
        warnings,
      };
    }

    if (!isAllowedHost(url.hostname)) {
      return {
        kind: "unsupported",
        rawInput,
        identifier: "",
        canonicalUrl: null,
        apiPathV1: null,
        apiPathV2: null,
        displayLabel: "Unsupported Host",
        reason: `Only Dailymotion URLs (dailymotion.com, dai.ly) are supported. Host "${url.hostname}" was rejected.`,
        warnings,
      };
    }

    // Short links (dai.ly/x8n8x8)
    if (url.hostname.toLowerCase().endsWith("dai.ly")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
      const cleanVideoId = videoId.split("_")[0]!;
      if (cleanVideoId) {
        return {
          kind: "video",
          rawInput,
          identifier: cleanVideoId,
          videoId: cleanVideoId,
          canonicalUrl: `https://www.dailymotion.com/video/${cleanVideoId}`,
          apiPathV1: `/video/${cleanVideoId}`,
          apiPathV2: `/v2/videos/${cleanVideoId}`,
          displayLabel: `Short Video ${cleanVideoId}`,
          warnings,
        };
      }
    }

    // Standard dailymotion.com paths
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const first = (segments[0] ?? "").toLowerCase();
    const second = segments[1] ?? "";

    if (first === "video" && second) {
      const cleanVideoId = second.split("_")[0]!;
      const playlistId = url.searchParams.get("playlist") ?? url.searchParams.get("list") ?? null;
      return {
        kind: "video",
        rawInput,
        identifier: cleanVideoId,
        videoId: cleanVideoId,
        playlistId,
        canonicalUrl: `https://www.dailymotion.com/video/${cleanVideoId}`,
        apiPathV1: `/video/${cleanVideoId}`,
        apiPathV2: `/v2/videos/${cleanVideoId}`,
        displayLabel: `Video ${cleanVideoId}`,
        warnings,
      };
    }

    if (first === "playlist" && second) {
      const cleanPlaylistId = second.split("_")[0]!;
      return {
        kind: "playlist",
        rawInput,
        identifier: cleanPlaylistId,
        playlistId: cleanPlaylistId,
        canonicalUrl: `https://www.dailymotion.com/playlist/${cleanPlaylistId}`,
        apiPathV1: `/playlist/${cleanPlaylistId}/videos`,
        apiPathV2: `/v2/playlists/${cleanPlaylistId}`,
        displayLabel: `Playlist ${cleanPlaylistId}`,
        warnings,
      };
    }

    if (first === "live" && second) {
      const cleanLiveId = second.split("_")[0]!;
      return {
        kind: "livestream",
        rawInput,
        identifier: cleanLiveId,
        canonicalUrl: `https://www.dailymotion.com/live/${cleanLiveId}`,
        apiPathV1: `/video/${cleanLiveId}`,
        apiPathV2: `/v2/livestreams/${cleanLiveId}`,
        displayLabel: `Livestream ${cleanLiveId}`,
        warnings,
      };
    }

    if (first === "channel" && second) {
      const cleanId = cleanIdentifier(second);
      return {
        kind: "channel",
        rawInput,
        identifier: cleanId,
        canonicalUrl: `https://www.dailymotion.com/channel/${cleanId}`,
        apiPathV1: `/channel/${cleanId}/videos`,
        apiPathV2: `/v2/profiles/${cleanId}/videos`,
        displayLabel: `Channel ${cleanId}`,
        warnings,
      };
    }

    if ((first === "user" || first === "profile") && second) {
      const cleanId = cleanIdentifier(second);
      return {
        kind: first === "user" ? "user" : "profile",
        rawInput,
        identifier: cleanId,
        canonicalUrl: `https://www.dailymotion.com/${first}/${cleanId}`,
        apiPathV1: `/user/${cleanId}/videos`,
        apiPathV2: `/v2/profiles/${cleanId}/videos`,
        displayLabel: `${first === "user" ? "User" : "Profile"} ${cleanId}`,
        warnings,
      };
    }

    if (first === "search") {
      const query = url.searchParams.get("q") || url.searchParams.get("query") || second || "";
      return {
        kind: "search",
        rawInput,
        identifier: query,
        canonicalUrl: `https://www.dailymotion.com/search/${encodeURIComponent(query)}`,
        apiPathV1: `/videos?search=${encodeURIComponent(query)}`,
        apiPathV2: null,
        displayLabel: `Search: "${query}"`,
        warnings: [
          ...warnings,
          {
            code: "v2_no_global_search",
            message: "Dailymotion API v2 does not offer global search. Global queries use v1 search.",
          },
        ],
      };
    }

    if (first && !["hub", "legal", "about", "press", "jobs", "terms", "privacy"].includes(first)) {
      const cleanId = cleanIdentifier(first);
      return {
        kind: "channel",
        rawInput,
        identifier: cleanId,
        canonicalUrl: `https://www.dailymotion.com/${cleanId}`,
        apiPathV1: `/user/${cleanId}/videos`,
        apiPathV2: `/v2/profiles/${cleanId}/videos`,
        displayLabel: `Channel ${cleanId}`,
        warnings,
      };
    }
  }

  // Handle handles e.g. @lemonde
  if (rawInput.startsWith("@")) {
    const handle = cleanIdentifier(rawInput);
    return {
      kind: "channel",
      rawInput,
      identifier: handle,
      canonicalUrl: `https://www.dailymotion.com/@${handle}`,
      apiPathV1: `/user/${handle}/videos`,
      apiPathV2: `/v2/profiles/${handle}/videos`,
      displayLabel: `Channel @${handle}`,
      warnings,
    };
  }

  // Handle bare video/playlist IDs (e.g. x8n8x8, x88apm)
  const cleanId = cleanIdentifier(rawInput);
  if (/^x[a-z0-9]+$/i.test(cleanId)) {
    return {
      kind: "video",
      rawInput,
      identifier: cleanId,
      videoId: cleanId,
      canonicalUrl: `https://www.dailymotion.com/video/${cleanId}`,
      apiPathV1: `/video/${cleanId}`,
      apiPathV2: `/v2/videos/${cleanId}`,
      displayLabel: `Video ${cleanId}`,
      warnings: [
        {
          code: "ambiguous_id",
          message: "Standard alphanumeric ID detected as Video. If this is a Playlist or Channel ID, select the type override.",
        },
      ],
    };
  }

  // Handle multi-word text, Arabic/Unicode search queries, or general search phrases
  if (/\s+/.test(cleanId) || (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanId) && !cleanId.startsWith("http"))) {
    return {
      kind: "search",
      rawInput,
      identifier: cleanId,
      canonicalUrl: `https://www.dailymotion.com/search/${encodeURIComponent(cleanId)}`,
      apiPathV1: `/videos?search=${encodeURIComponent(cleanId)}`,
      apiPathV2: null,
      displayLabel: `Search Query: "${cleanId}"`,
      warnings: [
        ...warnings,
        {
          code: "v2_no_global_search",
          message: "Dailymotion API v2 does not offer global search. Global queries use v1 search.",
        },
      ],
    };
  }

  // Fallback to channel/username handle
  return {
    kind: "channel",
    rawInput,
    identifier: cleanId,
    canonicalUrl: `https://www.dailymotion.com/${cleanId}`,
    apiPathV1: `/user/${cleanId}/videos`,
    apiPathV2: `/v2/profiles/${cleanId}/videos`,
    displayLabel: `Channel ${cleanId}`,
    warnings,
  };
}

/**
 * Legacy channel-specific analyzer maintained for backwards compatibility.
 */
export function analyzeDailymotionChannelInput(input: string): DailymotionChannelAnalysis {
  const sourceInput = input.trim();
  if (!sourceInput) throw new Error("Enter a Dailymotion channel URL, profile URL, username, or channel ID.");

  let url: URL | null = null;
  try {
    url = new URL(sourceInput.startsWith("http") ? sourceInput : `https://www.dailymotion.com/${sourceInput}`);
  } catch {
    url = null;
  }

  if (url && /(^|\.)dailymotion\.com$/i.test(url.hostname)) {
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const first = segments[0] ?? "";
    const second = segments[1] ?? "";
    if (first === "channel" && second) {
      const id = cleanIdentifier(second);
      return { sourceType: "channel", sourceInput, resolvedIdentifier: id, apiPath: `/channel/${encodeURIComponent(id)}/videos`, displayLabel: `Channel ${id}` };
    }
    if ((first === "user" || first === "profile") && second) {
      const id = cleanIdentifier(second);
      return { sourceType: "profile", sourceInput, resolvedIdentifier: id, apiPath: `/user/${encodeURIComponent(id)}/videos`, displayLabel: `Profile ${id}` };
    }
    if (first && first !== "video") {
      const id = cleanIdentifier(first);
      return { sourceType: "username", sourceInput, resolvedIdentifier: id, apiPath: `/user/${encodeURIComponent(id)}/videos`, displayLabel: `Username ${id}` };
    }
  }

  const id = cleanIdentifier(sourceInput);
  if (/^x[a-z0-9]+$/i.test(id) || /^channel[:/]/i.test(id)) {
    const channelId = id.replace(/^channel[:/]/i, "");
    return { sourceType: "channel_id", sourceInput, resolvedIdentifier: channelId, apiPath: `/channel/${encodeURIComponent(channelId)}/videos`, displayLabel: `Channel ID ${channelId}` };
  }

  return { sourceType: "username", sourceInput, resolvedIdentifier: id, apiPath: `/user/${encodeURIComponent(id)}/videos`, displayLabel: `Username ${id}` };
}
