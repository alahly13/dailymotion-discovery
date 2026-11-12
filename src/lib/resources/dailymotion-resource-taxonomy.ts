/**
 * Dailymotion Resource Taxonomy & Canonical Entity Contracts (2026)
 *
 * What this controls: canonical classification of Dailymotion items, local
 * saved entities, personal collections, saved search presets, and dataset types.
 * Why it exists: keeps UI badges, IndexedDB stores, R2 generation manifests,
 * Postgres indexes, and full metadata exports strictly aligned without ever
 * deriving identity from titles or URL text.
 * Scope: runtime-agnostic (client + server + tests).
 */

import type { ApiVersion, DiscoveryItem, DiscoveryItemKind } from "@/lib/discovery/types";

export const DAILYMOTION_RESOURCE_TYPES = [
  "VIDEO",
  "CHANNEL",
  "PROFILE",
  "PLAYLIST",
  "USER",
  "LIVESTREAM",
  "SAVED_SEARCH",
  "PERSONAL_COLLECTION",
  "UNKNOWN",
] as const;

export type DailymotionResourceType = (typeof DAILYMOTION_RESOURCE_TYPES)[number];

export const CANONICAL_DATASET_TYPES = [
  "SAVED_ITEMS",
  "COLLECTIONS",
  "SAVED_SEARCHES",
  "SEARCH_HISTORY",
  "RESEARCH_NOTES",
] as const;

export type CanonicalDatasetType = (typeof CANONICAL_DATASET_TYPES)[number];

export const DATASET_SLUG_MAP: Record<CanonicalDatasetType, string> = {
  SAVED_ITEMS: "saved-items",
  COLLECTIONS: "collections",
  SAVED_SEARCHES: "saved-searches",
  SEARCH_HISTORY: "search-history",
  RESEARCH_NOTES: "research-notes",
};

export interface ResourceTypeMeta {
  type: DailymotionResourceType;
  label: string;
  shortLabel: string;
  tone: "primary" | "success" | "warning" | "neutral";
}

export const RESOURCE_TYPE_META: Record<DailymotionResourceType, ResourceTypeMeta> = {
  VIDEO: { type: "VIDEO", label: "Video", shortLabel: "VIDEO", tone: "success" },
  CHANNEL: { type: "CHANNEL", label: "Channel", shortLabel: "CHANNEL", tone: "warning" },
  PROFILE: { type: "PROFILE", label: "Profile", shortLabel: "PROFILE", tone: "warning" },
  PLAYLIST: { type: "PLAYLIST", label: "Dailymotion Playlist", shortLabel: "DM PLAYLIST", tone: "primary" },
  USER: { type: "USER", label: "User", shortLabel: "USER", tone: "neutral" },
  LIVESTREAM: { type: "LIVESTREAM", label: "Livestream", shortLabel: "LIVE", tone: "warning" },
  SAVED_SEARCH: { type: "SAVED_SEARCH", label: "Saved Search Preset", shortLabel: "PRESET", tone: "primary" },
  PERSONAL_COLLECTION: { type: "PERSONAL_COLLECTION", label: "Personal Collection", shortLabel: "COLLECTION", tone: "primary" },
  UNKNOWN: { type: "UNKNOWN", label: "Unknown", shortLabel: "UNKNOWN", tone: "neutral" },
};

/**
 * Maps a normalized DiscoveryItem's kind + version into the authoritative
 * taxonomy discriminator. Distinctly separates v2 profiles from v1 channels/users
 * and keeps official Dailymotion playlists distinct from personal collections.
 */
export function classifyDiscoveryItem(item: Pick<DiscoveryItem, "kind" | "apiVersion">): DailymotionResourceType {
  switch (item.kind) {
    case "video":
      return "VIDEO";
    case "live":
      return "LIVESTREAM";
    case "playlist":
      return "PLAYLIST";
    case "channel":
      return item.apiVersion === "v2" ? "PROFILE" : "CHANNEL";
    case "user":
      return "USER";
    default:
      return "UNKNOWN";
  }
}

/**
 * Maps a taxonomy value or legacy lowercase kind back to DiscoveryItemKind.
 */
export function toDiscoveryKind(value: string | null | undefined): DiscoveryItemKind {
  const norm = (value ?? "").trim().toLowerCase();
  if (norm === "live" || norm === "livestream") return "live";
  if (norm === "playlist") return "playlist";
  if (norm === "channel" || norm === "profile") return "channel";
  if (norm === "user") return "user";
  return "video";
}

/**
 * Canonical Dailymotion web URL fallback when an API field omit url/video_url.
 */
export function canonicalDailymotionUrl(kind: DiscoveryItemKind, id: string, explicitUrl?: string | null): string | null {
  if (explicitUrl && explicitUrl.trim()) return explicitUrl.trim();
  const cleanId = id.trim();
  if (!cleanId) return null;
  switch (kind) {
    case "video":
    case "live":
      return `https://www.dailymotion.com/video/${encodeURIComponent(cleanId)}`;
    case "playlist":
      return `https://www.dailymotion.com/playlist/${encodeURIComponent(cleanId)}`;
    case "channel":
    case "user":
      return `https://www.dailymotion.com/${encodeURIComponent(cleanId)}`;
    default:
      return null;
  }
}

/**
 * Stable per-version composite key used in IndexedDB stores and deduplication.
 * Preserves v1 vs v2 provenance cleanly so items discovered on v1 and v2 are
 * tracked distinctly while sharing the same canonical provider ID.
 */
export function discoveryCompositeKey(apiVersion: ApiVersion, kind: DiscoveryItemKind, id: string): string {
  return `${apiVersion}:${kind}:${id}`;
}
