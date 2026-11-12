import type { AdvancedVideoFilters } from "@/types/filters";

export interface AiFilterHelperResponse {
  filters: AdvancedVideoFilters;
  explanation: string;
  warnings: string[];
}

export interface AiParsedQueryPlan {
  searchQuery: string;
  channel?: string;
  country?: string;
  language?: string;
  tags?: string;
  sort?: "relevance" | "recent" | "visited" | "visited-hour" | "visited-day" | "visited-week" | "visited-month";
  longerThan?: number;
  shorterThan?: number;
  createdAfter?: string;
  createdBefore?: string;
  explanation: string;
  warnings: string[];
}

const ALLOWED_V1_SORTS = new Set([
  "relevance",
  "recent",
  "visited",
  "visited-hour",
  "visited-day",
  "visited-week",
  "visited-month",
]);

function trimOrUndefined(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function isoDateOnlyOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return undefined;
}

export function validateAiFilters(input: unknown): AdvancedVideoFilters {
  if (!input || typeof input !== "object") return {};
  const candidate = input as Record<string, unknown>;
  const filters: AdvancedVideoFilters = {};
  const keyword = trimOrUndefined(candidate.keyword);
  const excludeKeyword = trimOrUndefined(candidate.excludeKeyword);
  const tags = trimOrUndefined(candidate.tags, 200);
  if (keyword) filters.keyword = keyword;
  if (excludeKeyword) filters.excludeKeyword = excludeKeyword;
  if (tags) filters.tags = tags;

  for (const key of ["minViews", "maxViews", "targetViews", "durationMin", "durationMax", "year", "yearFrom", "yearTo"] as const) {
    const value = candidate[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) filters[key] = value;
  }

  const dateFrom = isoDateOnlyOrUndefined(candidate.dateFrom);
  const dateTo = isoDateOnlyOrUndefined(candidate.dateTo);
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;

  const language = trimOrUndefined(candidate.language, 16);
  const channel = trimOrUndefined(candidate.channel, 64);
  const owner = trimOrUndefined(candidate.owner, 64);
  if (language) filters.language = language;
  if (channel) filters.channel = channel;
  if (owner) filters.owner = owner;
  if (typeof candidate.hasThumbnail === "boolean") filters.hasThumbnail = candidate.hasThumbnail;
  if (typeof candidate.hasDescription === "boolean") filters.hasDescription = candidate.hasDescription;
  if (typeof candidate.strictMetadataFiltering === "boolean") {
    filters.strictMetadataFiltering = candidate.strictMetadataFiltering;
  }
  return filters;
}

export function validateAiParsedQuery(input: unknown, fallbackQuery: string): AiParsedQueryPlan {
  const fallback = fallbackQuery.trim();
  if (!input || typeof input !== "object") {
    return {
      searchQuery: fallback,
      explanation: "Using your search phrase directly as the Dailymotion query.",
      warnings: [],
    };
  }

  const candidate = input as Record<string, unknown>;
  const sortRaw = typeof candidate.sort === "string" ? candidate.sort.trim() : undefined;
  const longerThan =
    typeof candidate.longerThan === "number" && Number.isFinite(candidate.longerThan) && candidate.longerThan > 0
      ? Math.round(candidate.longerThan)
      : undefined;
  const shorterThan =
    typeof candidate.shorterThan === "number" && Number.isFinite(candidate.shorterThan) && candidate.shorterThan > 0
      ? Math.round(candidate.shorterThan)
      : undefined;

  return {
    searchQuery: trimOrUndefined(candidate.searchQuery, 200) ?? fallback,
    channel: trimOrUndefined(candidate.channel, 48),
    country: trimOrUndefined(candidate.country, 8),
    language: trimOrUndefined(candidate.language, 12),
    tags: trimOrUndefined(candidate.tags, 160),
    sort: sortRaw && ALLOWED_V1_SORTS.has(sortRaw) ? (sortRaw as AiParsedQueryPlan["sort"]) : undefined,
    longerThan,
    shorterThan,
    createdAfter: isoDateOnlyOrUndefined(candidate.createdAfter),
    createdBefore: isoDateOnlyOrUndefined(candidate.createdBefore),
    explanation:
      trimOrUndefined(candidate.explanation, 500) ??
      "Translated your natural-language prompt into structured public Dailymotion API v1 search parameters.",
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0).slice(0, 4)
      : [],
  };
}
