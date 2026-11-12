/**
 * Discovery Result Local Filter & Search-Inside-Results Engine (2026)
 *
 * What this controls: deterministic client-side filtering, FlexSearch-style
 * field-weighted ranking, explicit/kids classification checks, zero-safe
 * numeric comparisons, and inclusive UTC date filtering over DiscoveryItem[].
 *
 * Why it exists: Keeps ProviderSearchState (upstream API params) cleanly
 * separated from LocalFilterState (loaded-result refinement with zero extra
 * API calls) and ResultViewState.
 *
 * Critical guarantees:
 *   1. Numeric range filters ALWAYS use nullish checks (`=== null`), never falsy
 *      checks, so `0` views or `0`s duration remain valid filterable numbers.
 *   2. Date-to upper bounds expand YYYY-MM-DD inputs to `T23:59:59.999Z` UTC
 *      so items published on the end day are never dropped.
 *   3. Works identically across search results, saved library items, collection
 *      members, and reopened search history snapshots.
 *
 * Scope: /search, /saved, /collections, /workspace, tests.
 */

import type { ApiVersion, DiscoveryItem, DiscoveryItemKind, DiscoveryResource } from "@/lib/discovery/types";

export type LocalTextTargetField = "all" | "title" | "description" | "owner" | "tags";
export type LocalPresenceFilter = "all" | "yes" | "no";
export type LocalExplicitFilter = "all" | "explicit_only" | "non_explicit";
export type LocalKidsFilter = "all" | "kids_only" | "non_kids";
export type LocalSortOrder =
  | "relevance"
  | "newest"
  | "oldest"
  | "views_desc"
  | "views_asc"
  | "duration_desc"
  | "duration_asc"
  | "title_asc"
  | "title_desc";

export interface ProviderSearchState {
  version: ApiVersion;
  resource: DiscoveryResource;
  mode: string;
  query: string;
  profileId: string;
  apiParams: Record<string, string>;
  fields: string[] | null;
}

export interface LocalFilterState {
  includeText: string;
  excludeKeywords: string;
  exactPhrase: string;
  targetFields: LocalTextTargetField;
  kinds: DiscoveryItemKind[];
  minViews: number | null;
  maxViews: number | null;
  minDurationSec: number | null;
  maxDurationSec: number | null;
  dateFrom: string;
  dateTo: string;
  yearFrom: number | null;
  yearTo: number | null;
  language: string;
  country: string;
  category: string;
  ownerFilter: string;
  tagFilter: string;
  explicitFilter: LocalExplicitFilter;
  kidsFilter: LocalKidsFilter;
  hasThumbnail: LocalPresenceFilter;
  hasDescription: LocalPresenceFilter;
  strictMetadata: boolean;
  localSort: LocalSortOrder;
}

export interface ResultViewState {
  items: DiscoveryItem[];
  selectedKeys: string[];
  inspectedItem: DiscoveryItem | null;
}

export const DEFAULT_DISCOVERY_LOCAL_FILTERS: LocalFilterState = {
  includeText: "",
  excludeKeywords: "",
  exactPhrase: "",
  targetFields: "all",
  kinds: [],
  minViews: null,
  maxViews: null,
  minDurationSec: null,
  maxDurationSec: null,
  dateFrom: "",
  dateTo: "",
  yearFrom: null,
  yearTo: null,
  language: "",
  country: "",
  category: "",
  ownerFilter: "",
  tagFilter: "",
  explicitFilter: "all",
  kidsFilter: "all",
  hasThumbnail: "all",
  hasDescription: "all",
  strictMetadata: false,
  localSort: "relevance",
};

function readRawFlag(item: DiscoveryItem, keys: string[]): boolean | null {
  for (const key of keys) {
    const extraVal = item.extra?.[key];
    if (typeof extraVal === "boolean") return extraVal;
    if (item.raw && typeof item.raw === "object") {
      const rawVal = (item.raw as Record<string, unknown>)[key];
      if (typeof rawVal === "boolean") return rawVal;
    }
  }
  return null;
}

function fieldHaystack(item: DiscoveryItem, target: LocalTextTargetField): string {
  switch (target) {
    case "title":
      return item.title ?? "";
    case "description":
      return item.description ?? "";
    case "owner":
      return `${item.ownerName ?? ""} ${item.ownerId ?? ""}`;
    case "tags":
      return (item.tags ?? []).join(" ");
    case "all":
    default:
      return [
        item.title,
        item.description,
        item.ownerName,
        item.ownerId,
        item.category,
        item.language,
        item.country,
        item.id,
        item.kind,
        ...(item.tags ?? []),
      ]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ");
  }
}

function scoreLocalMatch(item: DiscoveryItem, includeText: string, target: LocalTextTargetField): number {
  const query = includeText.trim().toLowerCase();
  if (!query) return 1;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  const title = (item.title ?? "").toLowerCase();
  const owner = `${item.ownerName ?? ""} ${item.ownerId ?? ""}`.toLowerCase();
  const tags = (item.tags ?? []).join(" ").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  const scoped = fieldHaystack(item, target).toLowerCase();

  // Require all include tokens to appear inside the chosen target haystack.
  for (const token of tokens) {
    if (!scoped.includes(token)) return 0;
  }

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += title === token ? 30 : title.startsWith(token) ? 18 : 12;
    if (owner.includes(token)) score += 7;
    if (tags.includes(token)) score += 6;
    if (description.includes(token)) score += 3;
    if (item.id.toLowerCase().includes(token)) score += 10;
  }
  if (scoped.includes(query)) score += 15;
  return score || 1;
}

function matchesTextRules(item: DiscoveryItem, filters: LocalFilterState): { matched: boolean; score: number } {
  const full = fieldHaystack(item, "all").toLowerCase();
  const targeted = fieldHaystack(item, filters.targetFields).toLowerCase();

  const exact = filters.exactPhrase.trim().toLowerCase();
  if (exact && !targeted.includes(exact)) {
    return { matched: false, score: 0 };
  }

  const excluded = filters.excludeKeywords
    .split(/[,\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  for (const term of excluded) {
    if (full.includes(term)) {
      return { matched: false, score: 0 };
    }
  }

  const score = scoreLocalMatch(item, filters.includeText, filters.targetFields);
  if (score <= 0) {
    return { matched: false, score: 0 };
  }
  return { matched: true, score };
}

function inZeroSafeRange(
  value: number | null | undefined,
  min: number | null,
  max: number | null,
  strictMetadata: boolean
): boolean {
  if (min === null && max === null) return true;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return !strictMetadata;
  }
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

function matchesDateBounds(item: DiscoveryItem, filters: LocalFilterState): boolean {
  const hasDateFilter = Boolean(
    filters.dateFrom.trim() || filters.dateTo.trim() || filters.yearFrom !== null || filters.yearTo !== null
  );
  if (!hasDateFilter) return true;

  if (!item.createdAt && item.year === null) {
    return !filters.strictMetadata;
  }

  const year = item.year ?? (item.createdAt ? new Date(item.createdAt).getUTCFullYear() : null);
  if (filters.yearFrom !== null && (year === null || year < filters.yearFrom)) return false;
  if (filters.yearTo !== null && (year === null || year > filters.yearTo)) return false;

  if (filters.dateFrom.trim()) {
    if (!item.createdAt) return !filters.strictMetadata;
    const fromMs = Date.parse(
      filters.dateFrom.includes("T") ? filters.dateFrom : `${filters.dateFrom.trim()}T00:00:00.000Z`
    );
    const createdMs = Date.parse(item.createdAt);
    if (!Number.isNaN(fromMs) && !Number.isNaN(createdMs) && createdMs < fromMs) return false;
  }

  if (filters.dateTo.trim()) {
    if (!item.createdAt) return !filters.strictMetadata;
    const toMs = Date.parse(
      filters.dateTo.includes("T") ? filters.dateTo : `${filters.dateTo.trim()}T23:59:59.999Z`
    );
    const createdMs = Date.parse(item.createdAt);
    if (!Number.isNaN(toMs) && !Number.isNaN(createdMs) && createdMs > toMs) return false;
  }

  return true;
}

function matchesClassification(item: DiscoveryItem, filters: LocalFilterState): boolean {
  if (filters.kinds.length > 0 && !filters.kinds.includes(item.kind)) return false;

  if (filters.language.trim()) {
    const lang = (item.language ?? "").toLowerCase();
    if (!lang) {
      if (filters.strictMetadata) return false;
      return false;
    }
    if (!lang.includes(filters.language.trim().toLowerCase())) return false;
  }

  if (filters.country.trim()) {
    const country = (item.country ?? "").toLowerCase();
    if (!country) {
      if (filters.strictMetadata) return false;
      return false;
    }
    if (!country.includes(filters.country.trim().toLowerCase())) return false;
  }

  if (filters.category.trim()) {
    const cat = (item.category ?? "").toLowerCase();
    if (!cat.includes(filters.category.trim().toLowerCase())) return false;
  }

  if (filters.ownerFilter.trim()) {
    const ownerHay = `${item.ownerName ?? ""} ${item.ownerId ?? ""}`.toLowerCase();
    if (!ownerHay.includes(filters.ownerFilter.trim().toLowerCase())) return false;
  }

  if (filters.tagFilter.trim()) {
    const wanted = filters.tagFilter
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const itemTags = (item.tags ?? []).map((t) => t.toLowerCase());
    for (const w of wanted) {
      if (!itemTags.some((tag) => tag.includes(w))) return false;
    }
  }

  if (filters.hasThumbnail !== "all") {
    const present = Boolean(item.thumbnail && item.thumbnail.trim().length > 0);
    if (filters.hasThumbnail === "yes" && !present) return false;
    if (filters.hasThumbnail === "no" && present) return false;
  }

  if (filters.hasDescription !== "all") {
    const present = Boolean(item.description && item.description.trim().length > 0);
    if (filters.hasDescription === "yes" && !present) return false;
    if (filters.hasDescription === "no" && present) return false;
  }

  if (filters.explicitFilter !== "all") {
    const isExplicit = readRawFlag(item, ["explicit", "is_explicit"]);
    if (filters.explicitFilter === "explicit_only" && isExplicit !== true) return false;
    if (filters.explicitFilter === "non_explicit" && isExplicit === true) return false;
  }

  if (filters.kidsFilter !== "all") {
    const isKids = readRawFlag(item, ["is_for_kids", "is_created_for_kids"]);
    if (filters.kidsFilter === "kids_only" && isKids !== true) return false;
    if (filters.kidsFilter === "non_kids" && isKids === true) return false;
  }

  return true;
}

function createdTimestamp(item: DiscoveryItem): number | null {
  if (!item.createdAt) return null;
  const ms = Date.parse(item.createdAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Filter + locally sort retrieved DiscoveryItem[] with zero upstream calls.
 */
export function applyDiscoveryResultPipeline(
  items: readonly DiscoveryItem[],
  filters: LocalFilterState
): DiscoveryItem[] {
  const scored: Array<{ item: DiscoveryItem; score: number; index: number }> = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const textResult = matchesTextRules(item, filters);
    if (!textResult.matched) continue;
    if (!inZeroSafeRange(item.views, filters.minViews, filters.maxViews, filters.strictMetadata)) continue;
    if (!inZeroSafeRange(item.duration, filters.minDurationSec, filters.maxDurationSec, filters.strictMetadata)) continue;
    if (!matchesDateBounds(item, filters)) continue;
    if (!matchesClassification(item, filters)) continue;

    scored.push({ item, score: textResult.score, index: i });
  }

  scored.sort((a, b) => {
    switch (filters.localSort) {
      case "newest": {
        const at = createdTimestamp(a.item) ?? -Infinity;
        const bt = createdTimestamp(b.item) ?? -Infinity;
        return bt - at || a.index - b.index;
      }
      case "oldest": {
        const at = createdTimestamp(a.item) ?? Infinity;
        const bt = createdTimestamp(b.item) ?? Infinity;
        return at - bt || a.index - b.index;
      }
      case "views_desc": {
        const av = a.item.views ?? -1;
        const bv = b.item.views ?? -1;
        return bv - av || a.index - b.index;
      }
      case "views_asc": {
        const av = a.item.views ?? Number.MAX_SAFE_INTEGER;
        const bv = b.item.views ?? Number.MAX_SAFE_INTEGER;
        return av - bv || a.index - b.index;
      }
      case "duration_desc": {
        const ad = a.item.duration ?? -1;
        const bd = b.item.duration ?? -1;
        return bd - ad || a.index - b.index;
      }
      case "duration_asc": {
        const ad = a.item.duration ?? Number.MAX_SAFE_INTEGER;
        const bd = b.item.duration ?? Number.MAX_SAFE_INTEGER;
        return ad - bd || a.index - b.index;
      }
      case "title_asc":
        return a.item.title.localeCompare(b.item.title) || a.index - b.index;
      case "title_desc":
        return b.item.title.localeCompare(a.item.title) || a.index - b.index;
      case "relevance":
      default:
        return b.score - a.score || a.index - b.index;
    }
  });

  return scored.map((entry) => entry.item);
}

export interface ActiveLocalFilterChip {
  key: keyof LocalFilterState;
  label: string;
}

export function listActiveLocalFilterChips(filters: LocalFilterState): ActiveLocalFilterChip[] {
  const chips: ActiveLocalFilterChip[] = [];
  if (filters.includeText.trim()) chips.push({ key: "includeText", label: `Contains: "${filters.includeText.trim()}"` });
  if (filters.excludeKeywords.trim()) chips.push({ key: "excludeKeywords", label: `Excludes: ${filters.excludeKeywords.trim()}` });
  if (filters.exactPhrase.trim()) chips.push({ key: "exactPhrase", label: `Exact: "${filters.exactPhrase.trim()}"` });
  if (filters.targetFields !== "all") chips.push({ key: "targetFields", label: `Field: ${filters.targetFields}` });
  if (filters.kinds.length > 0) chips.push({ key: "kinds", label: `Types: ${filters.kinds.join(", ")}` });
  if (filters.minViews !== null) chips.push({ key: "minViews", label: `Min views: ${filters.minViews}` });
  if (filters.maxViews !== null) chips.push({ key: "maxViews", label: `Max views: ${filters.maxViews}` });
  if (filters.minDurationSec !== null) chips.push({ key: "minDurationSec", label: `Min dur: ${filters.minDurationSec}s` });
  if (filters.maxDurationSec !== null) chips.push({ key: "maxDurationSec", label: `Max dur: ${filters.maxDurationSec}s` });
  if (filters.dateFrom) chips.push({ key: "dateFrom", label: `After: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: "dateTo", label: `Before: ${filters.dateTo}` });
  if (filters.yearFrom !== null) chips.push({ key: "yearFrom", label: `Year >= ${filters.yearFrom}` });
  if (filters.yearTo !== null) chips.push({ key: "yearTo", label: `Year <= ${filters.yearTo}` });
  if (filters.language.trim()) chips.push({ key: "language", label: `Lang: ${filters.language.trim()}` });
  if (filters.country.trim()) chips.push({ key: "country", label: `Country: ${filters.country.trim().toUpperCase()}` });
  if (filters.category.trim()) chips.push({ key: "category", label: `Category: ${filters.category.trim()}` });
  if (filters.ownerFilter.trim()) chips.push({ key: "ownerFilter", label: `Owner: ${filters.ownerFilter.trim()}` });
  if (filters.tagFilter.trim()) chips.push({ key: "tagFilter", label: `Tags: ${filters.tagFilter.trim()}` });
  if (filters.explicitFilter !== "all") chips.push({ key: "explicitFilter", label: filters.explicitFilter === "explicit_only" ? "Explicit only" : "Non-explicit" });
  if (filters.kidsFilter !== "all") chips.push({ key: "kidsFilter", label: filters.kidsFilter === "kids_only" ? "Kids only" : "Non-kids" });
  if (filters.hasThumbnail !== "all") chips.push({ key: "hasThumbnail", label: `Thumbnail: ${filters.hasThumbnail}` });
  if (filters.hasDescription !== "all") chips.push({ key: "hasDescription", label: `Description: ${filters.hasDescription}` });
  if (filters.strictMetadata) chips.push({ key: "strictMetadata", label: "Strict metadata" });
  if (filters.localSort !== "relevance") chips.push({ key: "localSort", label: `Local sort: ${filters.localSort}` });
  return chips;
}
