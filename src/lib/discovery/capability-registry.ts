// DailymotionCapabilityRegistry — per-version, per-resource capability truth.
//
// What this controls: which filters/sorts/operations each workspace may offer.
// Why it exists: UI components must NOT hardcode contradictory assumptions
// about what v1/v2 support (e.g. v1 anonymous global playlist search is 403;
// v2 has no global search at all). Every discovery page reads this registry.
// Findings: documented = official docs; live = probed 2026-10-10; mock =
// fixtures only (all v2 reads — no credentials supplied).
// Scope: all discovery UI + Capabilities page. Future agents: update this file
// when docs or probes change; components follow automatically.

import type { ApiVersion, DiscoveryResource } from "./types";
import { VERSION_DOC_URLS } from "./version-config";

export type FilterLayer = "server" | "local";
export type CapabilityEvidence = "documented" | "live" | "mock" | "needs-credentials";

export interface FilterCapability {
  key: string;
  label: string;
  layer: FilterLayer;
  /** Why a local-only filter exists (e.g. "v2 list endpoint has no query param"). */
  localReason?: string;
}

export interface ResourceCapability {
  resource: DiscoveryResource;
  version: ApiVersion;
  title: string;
  /** Exact endpoint template (path after base URL). */
  endpoint: string;
  method: "GET";
  /** false → the page must offer the documented alternative workflow. */
  globalSearch: boolean;
  alternativeWorkflow: string | null;
  auth: "public" | "optional-token" | "required";
  requiredScope: string | null;
  pagination: "v1-page-limit" | "v2-page-cursor";
  pageSizeMax: number;
  resultWindowCap: string;
  serverFilters: FilterCapability[];
  localFilters: FilterCapability[];
  sorts: { value: string; label: string }[];
  defaultSort: string;
  fieldsDoc: string;
  evidence: CapabilityEvidence;
  docUrl: string;
  notes: string;
}

const V1_VIDEO_SERVER: FilterCapability[] = [
  { key: "search", label: "Query", layer: "server" },
  { key: "channel", label: "Category", layer: "server" },
  { key: "country", label: "Country", layer: "server" },
  { key: "languages", label: "Languages", layer: "server" },
  { key: "tags", label: "Tags", layer: "server" },
  { key: "created_after", label: "Created after", layer: "server" },
  { key: "created_before", label: "Created before", layer: "server" },
  { key: "longer_than", label: "Min duration", layer: "server" },
  { key: "shorter_than", label: "Max duration", layer: "server" },
  { key: "owners", label: "Owner / profile", layer: "server" },
  { key: "live", label: "Live status", layer: "server" },
  { key: "hd", label: "HD only", layer: "server" },
  { key: "verified", label: "Verified only", layer: "server" },
  { key: "explicit", label: "Explicit", layer: "server" },
  { key: "family_filter", label: "Family filter", layer: "server" },
  { key: "localization", label: "Localization", layer: "server" },
];

const V1_USER_SERVER: FilterCapability[] = [
  { key: "search", label: "Query", layer: "server" },
  { key: "country", label: "Country", layer: "server" },
  { key: "language", label: "Language", layer: "server" },
  { key: "usernames", label: "Usernames", layer: "server" },
  { key: "flags", label: "Flags (popular, partner…)", layer: "server" },
];

const V1_PLAYLIST_SERVER: FilterCapability[] = [
  { key: "owner", label: "Owner / profile", layer: "server" },
  { key: "ids", label: "Playlist IDs", layer: "server" },
];

const V2_VIDEO_SERVER: FilterCapability[] = [
  { key: "visibility", label: "Visibility", layer: "server" },
  { key: "tags", label: "Tags", layer: "server" },
  { key: "created_after", label: "Created after (ISO)", layer: "server" },
  { key: "created_before", label: "Created before (ISO)", layer: "server" },
  { key: "is_explicit", label: "Explicit", layer: "server" },
  { key: "is_for_kids", label: "Made for kids", layer: "server" },
];

const LOCAL_VIDEO_FILTERS: FilterCapability[] = [
  { key: "local_query", label: "Filter retrieved results", layer: "local", localReason: "Applies to records already fetched on this page." },
  { key: "local_language", label: "Language (retrieved)", layer: "local", localReason: "Narrows the current result set only." },
  { key: "local_category", label: "Category (retrieved)", layer: "local", localReason: "Narrows the current result set only." },
  { key: "local_min_duration", label: "Min duration (retrieved)", layer: "local", localReason: "Narrows the current result set only." },
  { key: "local_has_thumbnail", label: "Has thumbnail", layer: "local", localReason: "Narrows the current result set only." },
];

const V1_SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "recent", label: "Most recent" },
  { value: "old", label: "Oldest" },
  { value: "visited", label: "Most viewed" },
  { value: "trending", label: "Trending" },
  { value: "random", label: "Random" },
];

const V1_USER_SORTS = [
  { value: "popular", label: "Popular" },
  { value: "recent", label: "Most recent" },
  { value: "relevance", label: "Relevance" },
  { value: "activity", label: "Activity" },
];

const V1_PLAYLIST_SORTS = [
  { value: "recent", label: "Most recent" },
  { value: "relevance", label: "Relevance" },
  { value: "alphaaz", label: "A → Z" },
];

const V2_SORTS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
];

function entry(partial: Omit<ResourceCapability, "version"> & { version: ApiVersion }): ResourceCapability {
  return partial;
}

const REGISTRY: ResourceCapability[] = [
  entry({
    resource: "general", version: "v1", title: "General Search v1",
    endpoint: "GET /videos", method: "GET", globalSearch: true, alternativeWorkflow: null,
    auth: "public", requiredScope: null, pagination: "v1-page-limit", pageSizeMax: 100,
    resultWindowCap: "~1000 results (page ≤ 10 at limit 100); date-window splits extend coverage",
    serverFilters: V1_VIDEO_SERVER, localFilters: LOCAL_VIDEO_FILTERS,
    sorts: V1_SORTS, defaultSort: "relevance",
    fieldsDoc: "Sparse `fields=` incl. id,title,description,thumbnail_*,duration,views_total,language,country,created_time,channel,owner.*,tags,url",
    evidence: "live", docUrl: "https://developers.dailymotion.com/v0/reference/api-list-videos.md",
    notes: "Full-text `search` (max 150 chars) is public and preserves Unicode. `relevance` sort requires `search`.",
  }),
  entry({
    resource: "general", version: "v2", title: "General Search v2",
    endpoint: "GET /profiles/{profile_id}/videos", method: "GET", globalSearch: false,
    alternativeWorkflow: "Enter a profile ID (or look it up via /me when authenticated) to browse that profile's catalog with v2 filters.",
    auth: "required", requiredScope: "video.read", pagination: "v2-page-cursor", pageSizeMax: 100,
    resultWindowCap: "Follow opaque `next` until null; ~1000-result guidance via created_after/created_before splits",
    serverFilters: V2_VIDEO_SERVER, localFilters: LOCAL_VIDEO_FILTERS,
    sorts: V2_SORTS, defaultSort: "-created_at",
    fieldsDoc: "Sparse `fields=` with dot notation (video_id,title,description,category,source.duration,thumbnail.h*_url,profile.*,video_url)",
    evidence: "mock", docUrl: "https://developers.dailymotion.com/reference/listprofilevideos.md",
    notes: "v2 exposes no global search endpoint. This page is an explicitly labelled profile-scoped alternative, never a fake global search.",
  }),
  entry({
    resource: "videos", version: "v1", title: "Video Search v1",
    endpoint: "GET /videos (+ GET /video/{id}, GET /video/{id}/related)", method: "GET", globalSearch: true, alternativeWorkflow: null,
    auth: "public", requiredScope: null, pagination: "v1-page-limit", pageSizeMax: 100,
    resultWindowCap: "~1000 results; date windows extend coverage",
    serverFilters: [...V1_VIDEO_SERVER, { key: "ids", label: "Video IDs", layer: "server" }],
    localFilters: LOCAL_VIDEO_FILTERS, sorts: V1_SORTS, defaultSort: "recent",
    fieldsDoc: "Same sparse video field set as General v1.",
    evidence: "live", docUrl: "https://developers.dailymotion.com/v0/reference/video-filters.md",
    notes: "Direct lookup by xID and related-video browsing supported.",
  }),
  entry({
    resource: "videos", version: "v2", title: "Video Search v2",
    endpoint: "GET /profiles/{profile_id}/videos (+ GET /videos/{id})", method: "GET", globalSearch: false,
    alternativeWorkflow: "Browse a known profile's videos, or look up a video directly by video_id.",
    auth: "required", requiredScope: "video.read", pagination: "v2-page-cursor", pageSizeMax: 100,
    resultWindowCap: "`next`-driven; date-window splits per browse-large-catalog guide",
    serverFilters: V2_VIDEO_SERVER, localFilters: LOCAL_VIDEO_FILTERS,
    sorts: V2_SORTS, defaultSort: "-created_at",
    fieldsDoc: "Same sparse v2 video field set as General v2.",
    evidence: "mock", docUrl: "https://developers.dailymotion.com/reference/get-video.md",
    notes: "Direct video lookup by video_id implemented alongside profile browsing.",
  }),
  entry({
    resource: "channels", version: "v1", title: "Channel Search v1",
    endpoint: "GET /users (+ GET /user/{id}, GET /user/{id}/videos)", method: "GET", globalSearch: true, alternativeWorkflow: null,
    auth: "public", requiredScope: null, pagination: "v1-page-limit", pageSizeMax: 100,
    resultWindowCap: "~1000 results (page cap shared with video listing)",
    serverFilters: V1_USER_SERVER, localFilters: [{ key: "local_query", label: "Filter retrieved results", layer: "local", localReason: "Narrows the current result set only." }],
    sorts: V1_USER_SORTS, defaultSort: "popular",
    fieldsDoc: "id,username,screenname,url,description,country,language,videos_total",
    evidence: "live", docUrl: "https://developers.dailymotion.com/v0/reference/user-filters.md",
    notes: "v1 has no separate channel object: channels are users. `channel` on videos is the category taxonomy.",
  }),
  entry({
    resource: "channels", version: "v2", title: "Channel Search v2",
    endpoint: "GET /profiles/{profile_id} (+ GET /me bootstrap)", method: "GET", globalSearch: false,
    alternativeWorkflow: "Look up a profile by profile_id (collect ids via GET /me when authenticated).",
    auth: "required", requiredScope: "profile.read", pagination: "v2-page-cursor", pageSizeMax: 100,
    resultWindowCap: "Single-object lookup; listings via profile videos endpoint",
    serverFilters: [], localFilters: [{ key: "local_query", label: "Filter retrieved results", layer: "local", localReason: "Lookup returns one profile." }],
    sorts: [], defaultSort: "",
    fieldsDoc: "profile_id,name,display_name,description,country,created_at",
    evidence: "mock", docUrl: "https://developers.dailymotion.com/reference/get-profile.md",
    notes: "No global profile search in v2. Avatars/covers are 'coming soon' upstream and not promised.",
  }),
  entry({
    resource: "playlists", version: "v1", title: "Playlist Search v1",
    endpoint: "GET /user/{owner}/playlists (+ GET /playlist/{id}, GET /playlist/{id}/videos)", method: "GET", globalSearch: false,
    alternativeWorkflow: "Enter an owner profile ID/username to list their playlists, or open a playlist directly by ID.",
    auth: "public", requiredScope: null, pagination: "v1-page-limit", pageSizeMax: 100,
    resultWindowCap: "~1000 results per listing",
    serverFilters: V1_PLAYLIST_SERVER, localFilters: [{ key: "local_query", label: "Filter retrieved results", layer: "local", localReason: "Narrows the current result set only." }],
    sorts: V1_PLAYLIST_SORTS, defaultSort: "recent",
    fieldsDoc: "id,name,description,videos_total,owner.*,created_time,url",
    evidence: "live", docUrl: "https://developers.dailymotion.com/v0/reference/playlist-filters.md",
    notes: "Anonymous global `GET /playlists?search=` is 403 upstream — the page does not offer it; owner + id workflows verified live.",
  }),
  entry({
    resource: "playlists", version: "v2", title: "Playlist Search v2",
    endpoint: "GET /profiles/{profile_id}/playlists (+ GET /playlists/{id}, GET /playlists/{id}/videos)", method: "GET", globalSearch: false,
    alternativeWorkflow: "Enter a profile ID to list its playlists, or open a playlist directly by ID.",
    auth: "required", requiredScope: "playlist.read", pagination: "v2-page-cursor", pageSizeMax: 100,
    resultWindowCap: "`next`-driven per listing",
    serverFilters: [{ key: "ids", label: "Playlist IDs", layer: "server" }], localFilters: [{ key: "local_query", label: "Filter retrieved results", layer: "local", localReason: "Narrows the current result set only." }],
    sorts: V2_SORTS, defaultSort: "-created_at",
    fieldsDoc: "playlist_id,title,description,created_at (+ videos_total where returned)",
    evidence: "mock", docUrl: "https://developers.dailymotion.com/reference/list-profile-playlists.md",
    notes: "No global playlist search in v2 (documented 'Not supported'). Visibility/thumbnail/owner fields not yet in v2.",
  }),
  entry({
    resource: "users", version: "v1", title: "User Search v1",
    endpoint: "GET /users (+ GET /user/{id})", method: "GET", globalSearch: true, alternativeWorkflow: null,
    auth: "public", requiredScope: null, pagination: "v1-page-limit", pageSizeMax: 100,
    resultWindowCap: "~1000 results",
    serverFilters: V1_USER_SERVER, localFilters: [{ key: "local_query", label: "Filter retrieved results", layer: "local", localReason: "Narrows the current result set only." }],
    sorts: V1_USER_SORTS, defaultSort: "popular",
    fieldsDoc: "Same user field set as Channel v1.",
    evidence: "live", docUrl: "https://developers.dailymotion.com/v0/reference/api-list-users.md",
    notes: "Same backing object as channels; workspace focuses on people/profiles with username lookup.",
  }),
  entry({
    resource: "users", version: "v2", title: "User Search v2",
    endpoint: "GET /users/{user_id} (+ GET /me)", method: "GET", globalSearch: false,
    alternativeWorkflow: "Look up a user by user_id (bootstrap via GET /me when authenticated).",
    auth: "required", requiredScope: "account.read", pagination: "v2-page-cursor", pageSizeMax: 100,
    resultWindowCap: "Single-object lookup",
    serverFilters: [], localFilters: [],
    sorts: [], defaultSort: "",
    fieldsDoc: "user_id + requested user fields",
    evidence: "mock", docUrl: "https://developers.dailymotion.com/reference/get-user.md",
    notes: "No user search/listing endpoint in v2.",
  }),
  entry({
    resource: "live", version: "v1", title: "Live Content v1",
    endpoint: "GET /videos (mode=live + live_* flags)", method: "GET", globalSearch: true, alternativeWorkflow: null,
    auth: "public", requiredScope: null, pagination: "v1-page-limit", pageSizeMax: 100,
    resultWindowCap: "~1000 results",
    serverFilters: [
      { key: "search", label: "Query", layer: "server" },
      { key: "live", label: "Live status (on-air, upcoming, off-air…)", layer: "server" },
      { key: "channel", label: "Category", layer: "server" },
      { key: "country", label: "Country", layer: "server" },
      { key: "languages", label: "Languages", layer: "server" },
    ],
    localFilters: LOCAL_VIDEO_FILTERS, sorts: [...V1_SORTS,
      { value: "live-audience", label: "Live audience" },
      { value: "live-airing-time", label: "Airing time" }], defaultSort: "live-audience",
    fieldsDoc: "Video field set + mode/live status where returned.",
    evidence: "live", docUrl: "https://developers.dailymotion.com/v0/reference/video-filters.md",
    notes: "`live_onair=1` + search verified live returning on-air streams.",
  }),
  entry({
    resource: "live", version: "v2", title: "Live Content v2",
    endpoint: "GET /profiles/{profile_id}/livestreams (+ GET /livestreams/{id})", method: "GET", globalSearch: false,
    alternativeWorkflow: "Enter a profile ID to list its livestreams with a status filter.",
    auth: "required", requiredScope: "live.read", pagination: "v2-page-cursor", pageSizeMax: 100,
    resultWindowCap: "`next`-driven per listing",
    serverFilters: [
      { key: "status", label: "Status", layer: "server" },
      { key: "visibility", label: "Visibility", layer: "server" },
      { key: "created_after", label: "Created after (ISO)", layer: "server" },
      { key: "created_before", label: "Created before (ISO)", layer: "server" },
      { key: "tags", label: "Tags", layer: "server" },
    ],
    localFilters: LOCAL_VIDEO_FILTERS, sorts: V2_SORTS, defaultSort: "-created_at",
    fieldsDoc: "livestream_id,title,category,status,visibility,created_at,profile.*",
    evidence: "mock", docUrl: "https://developers.dailymotion.com/reference/list-profile-livestreams.md",
    notes: "No v2 equivalent of v1's global live flags — recorded version difference.",
  }),
];

export function getCapability(resource: DiscoveryResource, version: ApiVersion): ResourceCapability {
  const found = REGISTRY.find((item) => item.resource === resource && item.version === version);
  if (!found) throw new Error(`No capability registered for ${resource} ${version}.`);
  return found;
}

export function listCapabilities(): ResourceCapability[] {
  return [...REGISTRY];
}

export function docUrlFor(version: ApiVersion): string {
  return VERSION_DOC_URLS[version].reference;
}
