/**
 * Central Filter Capability Registry — explicit `api` vs `local` vs `unsupported`
 * matrix across Dailymotion Legacy/Partner API v1 and REST API v2.
 *
 * What this controls: Unified Search UI badges, Capability page matrix, and
 * honest separation between server-executed provider query params (`api`) and
 * browser-executed post-fetch filters (`local`, zero extra API calls).
 * Scope: /search, /capabilities, and discovery test suites.
 */

import type { ApiVersion, DiscoveryResource } from "./types";

export type FilterSupportLayer = "api" | "local" | "unsupported";
export type FilterCategoryGroup =
  | "text"
  | "time"
  | "duration"
  | "engagement"
  | "taxonomy"
  | "classification"
  | "ownership"
  | "sorting";

export interface UnifiedFilterCapability {
  key: string;
  label: string;
  category: FilterCategoryGroup;
  supportByVersion: Record<ApiVersion, FilterSupportLayer>;
  supportedResources: DiscoveryResource[];
  apiParamByVersion?: Partial<Record<ApiVersion, string>>;
  description: string;
}

const VIDEO_RESOURCES: DiscoveryResource[] = ["general", "videos", "live"];
const ALL_RESOURCES: DiscoveryResource[] = ["general", "videos", "channels", "playlists", "users", "live"];

export const FILTER_CAPABILITY_MATRIX: UnifiedFilterCapability[] = [
  {
    key: "query",
    label: "Global Full-Text Query",
    category: "text",
    supportByVersion: { v1: "api", v2: "local" },
    supportedResources: ALL_RESOURCES,
    apiParamByVersion: { v1: "search" },
    description: "V1 supports global `search` query; V2 has no global text search so text queries filter retrieved profile items locally.",
  },
  {
    key: "include_exclude_exact",
    label: "Include / Exclude / Exact Phrase & Field Targeting",
    category: "text",
    supportByVersion: { v1: "local", v2: "local" },
    supportedResources: ALL_RESOURCES,
    description: "Weighted local search inside retrieved results (title, description, owner, tags) with zero extra API calls.",
  },
  {
    key: "date_range",
    label: "Created Date Range (created_after / created_before)",
    category: "time",
    supportByVersion: { v1: "api", v2: "api" },
    supportedResources: ["general", "videos", "live"],
    apiParamByVersion: { v1: "created_after, created_before (unix s)", v2: "created_after, created_before (ISO-8601)" },
    description: "Both APIs support date range slicing; UTC inclusive post-fetch refinement also works locally.",
  },
  {
    key: "duration_bounds",
    label: "Duration Bounds (min / max seconds or minutes)",
    category: "duration",
    supportByVersion: { v1: "api", v2: "local" },
    supportedResources: VIDEO_RESOURCES,
    apiParamByVersion: { v1: "longer_than, shorter_than (min)" },
    description: "V1 filters server-side in minutes (`longer_than` / `shorter_than`); V2 filters locally against `source.duration`.",
  },
  {
    key: "views_range",
    label: "Views Range (minViews / maxViews)",
    category: "engagement",
    supportByVersion: { v1: "local", v2: "local" },
    supportedResources: VIDEO_RESOURCES,
    description: "Filtered locally on retrieved results with strict nullish zero-safe checks (0 views preserved).",
  },
  {
    key: "category_channel",
    label: "Category / Channel Taxonomy",
    category: "taxonomy",
    supportByVersion: { v1: "api", v2: "local" },
    supportedResources: ALL_RESOURCES,
    apiParamByVersion: { v1: "channel" },
    description: "V1 sends `channel` taxonomy slug; V2 returns `category` in payloads so category narrowing runs locally.",
  },
  {
    key: "language",
    label: "Language",
    category: "taxonomy",
    supportByVersion: { v1: "api", v2: "local" },
    supportedResources: ALL_RESOURCES,
    apiParamByVersion: { v1: "languages / language" },
    description: "V1 filters via `languages` on video endpoints; V2 filters loaded results locally on `language`.",
  },
  {
    key: "tags",
    label: "Tags",
    category: "taxonomy",
    supportByVersion: { v1: "api", v2: "api" },
    supportedResources: VIDEO_RESOURCES,
    apiParamByVersion: { v1: "tags", v2: "tags" },
    description: "Supported natively by both V1 video search and V2 profile listings, plus local tag refinement.",
  },
  {
    key: "profile_owner",
    label: "Profile / Owner Scope",
    category: "ownership",
    supportByVersion: { v1: "api", v2: "api" },
    supportedResources: ALL_RESOURCES,
    apiParamByVersion: { v1: "owners / owner", v2: "/profiles/{profile_id}/*" },
    description: "V1 accepts optional `owners`; V2 requires parent `profile_id` path scoping.",
  },
  {
    key: "visibility",
    label: "Visibility (public / private / password)",
    category: "classification",
    supportByVersion: { v1: "local", v2: "api" },
    supportedResources: ["general", "videos", "live"],
    apiParamByVersion: { v2: "visibility" },
    description: "V2 supports `visibility` natively; public V1 endpoints return public items (private requires partner scope).",
  },
  {
    key: "explicit_and_kids",
    label: "Explicit & Made-for-Kids Classification",
    category: "classification",
    supportByVersion: { v1: "api", v2: "api" },
    supportedResources: VIDEO_RESOURCES,
    apiParamByVersion: { v1: "explicit, family_filter", v2: "is_explicit, is_for_kids" },
    description: "Distinct parameter semantics per version, plus client-side classification chips.",
  },
  {
    key: "hd_verified",
    label: "HD & Verified Flags",
    category: "classification",
    supportByVersion: { v1: "api", v2: "unsupported" },
    supportedResources: ["general", "videos"],
    apiParamByVersion: { v1: "hd, verified" },
    description: "Supported on V1 `/videos`; not exposed as query parameters in V2 list endpoints.",
  },
  {
    key: "live_status",
    label: "Live Stream Status",
    category: "classification",
    supportByVersion: { v1: "api", v2: "api" },
    supportedResources: ["general", "videos", "live"],
    apiParamByVersion: { v1: "live_onair, live_upcoming, live_offair, live, no_live", v2: "status (onair / offair)" },
    description: "V1 supports live flags on `/videos`; V2 exposes `status` on `/profiles/{id}/livestreams`.",
  },
  {
    key: "localization",
    label: "Regional Localization",
    category: "taxonomy",
    supportByVersion: { v1: "api", v2: "unsupported" },
    supportedResources: ["general", "videos", "live"],
    apiParamByVersion: { v1: "localization" },
    description: "Global parameter on V1 only; omitted on V2 requests.",
  },
  {
    key: "sort_options",
    label: "API Sorting vs Local Re-sorting",
    category: "sorting",
    supportByVersion: { v1: "api", v2: "api" },
    supportedResources: ALL_RESOURCES,
    apiParamByVersion: { v1: "sort (relevance, recent, old, visited, trending, ...)", v2: "sort (-created_at, created_at)" },
    description: "API sort triggers upstream ordering; local sort re-orders loaded results (views, duration, date, title) without API calls.",
  },
];

export function getFilterCapabilitiesFor(version: ApiVersion, resource: DiscoveryResource) {
  return FILTER_CAPABILITY_MATRIX.filter((entry) => entry.supportedResources.includes(resource)).map((entry) => ({
    ...entry,
    support: entry.supportByVersion[version],
    apiParam: entry.apiParamByVersion?.[version] ?? null,
  }));
}
