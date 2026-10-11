// Parameter compatibility registry — which controls each endpoint supports.
//
// What this controls: the dynamic Search filter panel and field selector.
// Why it exists: a parameter valid for V1 must never be assumed valid for V2
// (and vice versa), and not every parameter of an endpoint suits discovery.
// Each entry records support per version+endpoint, type, allowed values,
// default, auth needs, and limits — from the inspected official references.
// Unsupported parameters are OMITTED from requests, never sent.
// Groups: basic | safety | localization | sorting | advanced.
// Scope: unified Search page + tests. DiscoveryExplorer keeps its curated
// controls; both read the capability registry for availability truth.

import type { ApiVersion } from "./types";

export type ParamGroup = "basic" | "safety" | "localization" | "sorting" | "advanced";
export type ParamControl = "text" | "select" | "multiselect" | "number" | "date" | "boolean3" | "fields";

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  key: string;
  /** Wire name sent to the API (version-specific). */
  wire: string;
  label: string;
  description: string;
  group: ParamGroup;
  control: ParamControl;
  options?: ParamOption[];
  /** Safe default. null = omit (let the API default apply). */
  default: string | null;
  min?: number;
  max?: number;
  /** Endpoint requires a token for this param (informational). */
  auth: "public" | "token";
  docUrl: string;
}

const V1_DOC = "https://developers.dailymotion.com/v0/reference/video-filters.md";
const V1_GLOBAL_DOC = "https://developers.dailymotion.com/v0/reference/global-api-parameters.md";
const V2_DOC = "https://developers.dailymotion.com/reference/listprofilevideos.md";

export const V1_VIDEO_SORTS: ParamOption[] = [
  { value: "relevance", label: "Relevance (needs query)" },
  { value: "recent", label: "Most recent" },
  { value: "old", label: "Oldest" },
  { value: "visited", label: "Most viewed" },
  { value: "trending", label: "Trending" },
  { value: "live-audience", label: "Live audience" },
  { value: "live-airing-time", label: "Airing time" },
  { value: "random", label: "Random" },
];

export const V2_VIDEO_SORTS: ParamOption[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
];

/** Fields the result cards require — the selector can never deselect these. */
export const V1_MANDATORY_FIELDS = ["id", "title"];
export const V2_MANDATORY_FIELDS = ["video_id", "title"];

export const V1_VIDEO_FIELD_OPTIONS: ParamOption[] = [
  { value: "id", label: "id (required)" },
  { value: "title", label: "title (required)" },
  { value: "description", label: "description" },
  { value: "url", label: "url" },
  { value: "thumbnail_720_url", label: "thumbnail 720" },
  { value: "thumbnail_480_url", label: "thumbnail 480" },
  { value: "thumbnail_360_url", label: "thumbnail 360" },
  { value: "duration", label: "duration" },
  { value: "views_total", label: "views_total" },
  { value: "language", label: "language" },
  { value: "country", label: "country" },
  { value: "created_time", label: "created_time" },
  { value: "channel", label: "channel (category)" },
  { value: "channel.name", label: "channel.name" },
  { value: "owner", label: "owner" },
  { value: "owner.screenname", label: "owner.screenname" },
  { value: "tags", label: "tags" },
];

export const V2_VIDEO_FIELD_OPTIONS: ParamOption[] = [
  { value: "video_id", label: "video_id (required)" },
  { value: "title", label: "title (required)" },
  { value: "description", label: "description" },
  { value: "video_url", label: "video_url" },
  { value: "category", label: "category" },
  { value: "visibility", label: "visibility" },
  { value: "language", label: "language" },
  { value: "country", label: "country" },
  { value: "created_at", label: "created_at" },
  { value: "published_at", label: "published_at" },
  { value: "source.duration", label: "source.duration" },
  { value: "tags", label: "tags" },
  { value: "thumbnail.h720_url", label: "thumbnail.h720_url" },
  { value: "thumbnail.h480_url", label: "thumbnail.h480_url" },
  { value: "profile.profile_id", label: "profile.profile_id" },
  { value: "profile.name", label: "profile.name" },
];

const CATEGORIES: ParamOption[] = [
  "news", "sport", "music", "tech", "fun", "people", "animals", "auto",
  "creation", "kids", "lifestyle", "school", "travel", "tv", "videogames", "webcam",
].map((c) => ({ value: c, label: c }));

/** V1 video-search endpoint schema (GET /videos + profile/playlist scoping). */
export const V1_SEARCH_SCHEMA: ParamDef[] = [
  { key: "channel", wire: "channel", label: "Category", description: "Dailymotion category taxonomy.", group: "basic", control: "select", options: CATEGORIES, default: null, auth: "public", docUrl: V1_DOC },
  { key: "languages", wire: "languages", label: "Languages", description: "Comma-separated ISO codes (declarative).", group: "basic", control: "text", default: null, auth: "public", docUrl: V1_DOC },
  { key: "tags", wire: "tags", label: "Tags", description: "Tag full-text (AND by default).", group: "basic", control: "text", default: null, auth: "public", docUrl: V1_DOC },
  { key: "createdAfter", wire: "created_after", label: "Created after", description: "Date filter (unix seconds on the wire).", group: "basic", control: "date", default: null, auth: "public", docUrl: V1_DOC },
  { key: "createdBefore", wire: "created_before", label: "Created before", description: "Date filter (unix seconds on the wire).", group: "basic", control: "date", default: null, auth: "public", docUrl: V1_DOC },
  { key: "longerThan", wire: "longer_than", label: "Min duration (minutes)", description: "Videos at least this long.", group: "basic", control: "number", default: null, min: 0, auth: "public", docUrl: V1_DOC },
  { key: "shorterThan", wire: "shorter_than", label: "Max duration (minutes)", description: "Videos at most this long.", group: "basic", control: "number", default: null, min: 0, auth: "public", docUrl: V1_DOC },
  { key: "live", wire: "live", label: "Live status", description: "Live vs regular video content.", group: "basic", control: "select", options: [
    { value: "", label: "Any" },
    { value: "live_onair", label: "On air" },
    { value: "live_upcoming", label: "Upcoming" },
    { value: "live_offair", label: "Off air" },
    { value: "live", label: "Any live" },
    { value: "no_live", label: "Exclude live" },
  ], default: null, auth: "public", docUrl: V1_DOC },
  { key: "owners", wire: "owners", label: "Owners", description: "Comma-separated user ids/logins.", group: "advanced", control: "text", default: null, auth: "public", docUrl: V1_DOC },
  { key: "hd", wire: "hd", label: "HD only", description: "Resolution ≥ 720p.", group: "advanced", control: "select", options: [{ value: "", label: "Any" }, { value: "1", label: "HD only" }], default: null, auth: "public", docUrl: V1_DOC },
  { key: "verified", wire: "verified", label: "Verified only", description: "Verified partner videos.", group: "advanced", control: "select", options: [{ value: "", label: "Any" }, { value: "1", label: "Verified only" }], default: null, auth: "public", docUrl: V1_DOC },
  { key: "familyFilter", wire: "family_filter", label: "Family filter", description: "ON hides explicit content (API default). OFF exposes explicit results — use deliberately.", group: "safety", control: "boolean3", default: null, auth: "public", docUrl: V1_GLOBAL_DOC },
  { key: "explicit", wire: "explicit", label: "Explicit content", description: "Limit to an explicit flag value.", group: "safety", control: "select", options: [{ value: "", label: "Any" }, { value: "true", label: "Explicit" }, { value: "false", label: "Non-explicit" }], default: null, auth: "public", docUrl: V1_DOC },
  { key: "localization", wire: "localization", label: "Localization", description: "Result locale (detect or locale code). v1 global param.", group: "localization", control: "text", default: null, auth: "public", docUrl: V1_GLOBAL_DOC },
  { key: "sort", wire: "sort", label: "Sort", description: "Endpoint ordering. relevance needs a query.", group: "sorting", control: "select", options: V1_VIDEO_SORTS, default: "relevance", auth: "public", docUrl: V1_DOC },
  { key: "fields", wire: "fields", label: "Response fields", description: "Sparse selection. id + title always kept.", group: "sorting", control: "fields", default: null, auth: "public", docUrl: V1_DOC },
  { key: "pageSize", wire: "limit", label: "Page size (limit)", description: "1–100 per page.", group: "sorting", control: "number", default: "20", min: 1, max: 100, auth: "public", docUrl: V1_DOC },
];

/** V2 profile-video listing schema. No localization, no family_filter here. */
export const V2_SEARCH_SCHEMA: ParamDef[] = [
  { key: "profileId", wire: "profileId", label: "Profile ID", description: "v2 listings are profile-scoped (no global search).", group: "basic", control: "text", default: null, auth: "token", docUrl: V2_DOC },
  { key: "visibility", wire: "visibility", label: "Visibility", description: "public / private / password.", group: "basic", control: "select", options: [
    { value: "", label: "Any" }, { value: "public", label: "Public" }, { value: "private", label: "Private" }, { value: "password", label: "Password" },
  ], default: null, auth: "token", docUrl: V2_DOC },
  { key: "tags", wire: "tags", label: "Tags", description: "Comma-separated tags.", group: "basic", control: "text", default: null, auth: "token", docUrl: V2_DOC },
  { key: "createdAfter", wire: "created_after", label: "Created after", description: "ISO-8601 on the wire.", group: "basic", control: "date", default: null, auth: "token", docUrl: V2_DOC },
  { key: "createdBefore", wire: "created_before", label: "Created before", description: "ISO-8601 on the wire.", group: "basic", control: "date", default: null, auth: "token", docUrl: V2_DOC },
  { key: "isExplicit", wire: "is_explicit", label: "Explicit content", description: "v2 explicit-content filter (different param/semantics than v1 family_filter).", group: "safety", control: "select", options: [{ value: "", label: "Any" }, { value: "true", label: "Explicit" }, { value: "false", label: "Non-explicit" }], default: null, auth: "token", docUrl: V2_DOC },
  { key: "isForKids", wire: "is_for_kids", label: "Made for kids", description: "Kids-content flag.", group: "safety", control: "select", options: [{ value: "", label: "Any" }, { value: "true", label: "For kids" }, { value: "false", label: "Not for kids" }], default: null, auth: "token", docUrl: V2_DOC },
  { key: "sort", wire: "sort", label: "Sort", description: "Only created_at is sortable in v2.", group: "sorting", control: "select", options: V2_VIDEO_SORTS, default: "-created_at", auth: "token", docUrl: V2_DOC },
  { key: "fields", wire: "fields", label: "Response fields", description: "Sparse selection with dot notation. video_id + title always kept.", group: "sorting", control: "fields", default: null, auth: "token", docUrl: V2_DOC },
  { key: "pageSize", wire: "page_size", label: "Page size (page_size)", description: "1–100 per page.", group: "sorting", control: "number", default: "20", min: 1, max: 100, auth: "token", docUrl: V2_DOC },
];

export function schemaFor(version: ApiVersion): ParamDef[] {
  return version === "v1" ? V1_SEARCH_SCHEMA : V2_SEARCH_SCHEMA;
}

/** Validate sort against query presence. Returns {sort, notice}. */
export function resolveSort(version: ApiVersion, sort: string | null | undefined, hasQuery: boolean): { sort: string; notice: string | null } {
  if (version === "v2") {
    const allowed = V2_VIDEO_SORTS.map((o) => o.value);
    if (sort && allowed.includes(sort)) return { sort, notice: null };
    return { sort: "-created_at", notice: sort ? `Sort "${sort}" is not supported by this v2 endpoint — reset to newest first.` : null };
  }
  const allowed = V1_VIDEO_SORTS.map((o) => o.value);
  if (!sort || !allowed.includes(sort)) return { sort: hasQuery ? "relevance" : "recent", notice: sort ? `Sort "${sort}" is not supported here — reset to a safe default.` : null };
  if (sort === "relevance" && !hasQuery) {
    return { sort: "recent", notice: "relevance needs a search query — switched to most recent." };
  }
  return { sort, notice: null };
}

/** Merge explicit fields with mandatory ones (mandatory always kept). */
export function resolveFields(version: ApiVersion, selected: string[] | null | undefined): string[] | null {
  if (!selected || selected.length === 0) return null; // omit → server default set
  const mandatory = version === "v1" ? V1_MANDATORY_FIELDS : V2_MANDATORY_FIELDS;
  const catalog = (version === "v1" ? V1_VIDEO_FIELD_OPTIONS : V2_VIDEO_FIELD_OPTIONS).map((o) => o.value);
  const kept = selected.filter((f) => catalog.includes(f));
  return [...new Set([...mandatory, ...kept])];
}

/** Stable cache key separating version + resource + mode + effective params. */
export function buildSearchCacheKey(version: ApiVersion, resource: string, mode: string, params: Record<string, string>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== "" && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${version}:${resource}:${mode}:${JSON.stringify(entries)}`;
}
