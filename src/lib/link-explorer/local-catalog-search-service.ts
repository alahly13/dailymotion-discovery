// Local Catalog Search Service — Zero-API-Call Real-Time In-Memory & Local Database Search (2026)
//
// What this controls: Real-time search and multi-dimensional filtering across locally retrieved
// channel and playlist catalogs. Operates with 100% ZERO network calls to Dailymotion API or Gemini.
// Features bilingual Arabic & English normalization, tokenized multi-word matching, metadata field
// search (title, description, tags, IDs, dates, owner), and composable filter chips.
// Scope: Link Explorer (/link-explorer) Local Search.

import type { DiscoveryItem } from "@/lib/discovery/types";

export interface LocalCatalogSearchCriteria {
  query?: string;
  kind?: "all" | "video" | "channel" | "playlist" | "livestream";
  year?: number | null;
  createdFrom?: string | null; // YYYY-MM-DD
  createdTo?: string | null;   // YYYY-MM-DD
  periodId?: string | null;
  hasDescription?: boolean | null;
  hasTags?: boolean | null;
  durationRange?: "all" | "short" | "medium" | "long";
  viewsRange?: "all" | "under_1k" | "1k_10k" | "10k_100k" | "over_100k";
  sortBy?:
    | "relevance"
    | "newest"
    | "oldest"
    | "views_desc"
    | "views_asc"
    | "duration_desc"
    | "duration_asc"
    | "title_asc"
    | "title_desc";
}

export interface LocalCatalogSearchResult {
  items: DiscoveryItem[];
  totalMatched: number;
  totalInCatalog: number;
  searchDurationMs: number;
  facetCounts: {
    byKind: Record<string, number>;
    byYear: Record<number, number>;
  };
}

/**
 * Normalizes text for bilingual search:
 * - Strips leading/trailing whitespace and lowercases.
 * - Arabic: normalizes Alef forms, Taa Marbuta, Alif Maqsura, strips Tashkeel (harakat) and Tatweel.
 * - Latin: Unicode NFC normalization.
 */
export function normalizeSearchString(text: string): string {
  if (!text) return "";
  let norm = text.normalize("NFC").toLowerCase();

  // Arabic Normalization:
  // 1. Remove Tashkeel / Harakat (Fatha, Damma, Kasra, Sukun, Shadda, Tanwin)
  norm = norm.replace(/[\u064B-\u065F\u0670]/g, "");
  // 2. Remove Tatweel (Kashida)
  norm = norm.replace(/\u0640/g, "");
  // 3. Normalize Alef variants (أ, إ, آ -> ا)
  norm = norm.replace(/[\u0622\u0623\u0625]/g, "\u0627");
  // 4. Normalize Taa Marbuta (ة -> ه)
  norm = norm.replace(/\u0629/g, "\u0647");
  // 5. Normalize Alif Maqsura (ى -> ي)
  norm = norm.replace(/\u0649/g, "\u064A");

  return norm.trim();
}

/**
 * Checks if all query tokens are present in the item's composite search text.
 */
function itemMatchesQuery(item: DiscoveryItem, queryTokens: string[]): { matches: boolean; score: number } {
  if (queryTokens.length === 0) return { matches: true, score: 0 };

  const normTitle = normalizeSearchString(item.title || "");
  const normDesc = normalizeSearchString(item.description || "");
  const normId = normalizeSearchString(item.id || "");
  const normOwner = normalizeSearchString(item.ownerName || item.ownerId || "");
  const normTags = (item.tags || []).map((t) => normalizeSearchString(t)).join(" ");

  let totalScore = 0;

  for (const token of queryTokens) {
    let tokenFound = false;

    // Highest score: match in title
    if (normTitle.includes(token)) {
      totalScore += 10;
      tokenFound = true;
    }
    // High score: match in tags
    if (normTags.includes(token)) {
      totalScore += 5;
      tokenFound = true;
    }
    // Moderate score: match in description
    if (normDesc.includes(token)) {
      totalScore += 3;
      tokenFound = true;
    }
    // Identifier match
    if (normId.includes(token)) {
      totalScore += 8;
      tokenFound = true;
    }
    // Owner name match
    if (normOwner.includes(token)) {
      totalScore += 4;
      tokenFound = true;
    }

    if (!tokenFound) {
      return { matches: false, score: 0 };
    }
  }

  return { matches: true, score: totalScore };
}

/**
 * Searches and filters a locally retrieved catalog with 0 API calls.
 */
export function searchLocalCatalog(
  items: DiscoveryItem[],
  criteria: LocalCatalogSearchCriteria = {}
): LocalCatalogSearchResult {
  const startTime = performance.now();
  const rawQuery = (criteria.query || "").trim();
  const queryTokens = rawQuery ? normalizeSearchString(rawQuery).split(/\s+/).filter(Boolean) : [];

  const kindFilter = criteria.kind && criteria.kind !== "all" ? criteria.kind : null;
  const yearFilter = criteria.year ?? null;
  const createdFromMs = criteria.createdFrom ? new Date(criteria.createdFrom).getTime() : null;
  const createdToMs = criteria.createdTo ? new Date(`${criteria.createdTo}T23:59:59.999Z`).getTime() : null;
  const periodFilter = criteria.periodId || null;
  const durationRange = criteria.durationRange || "all";
  const viewsRange = criteria.viewsRange || "all";
  const sortBy = criteria.sortBy || (queryTokens.length > 0 ? "relevance" : "newest");

  const byKind: Record<string, number> = {};
  const byYear: Record<number, number> = {};

  const scoredMatches: Array<{ item: DiscoveryItem; score: number }> = [];

  for (const item of items) {
    // 1. Kind filter
    const k = item.kind || "video";
    byKind[k] = (byKind[k] || 0) + 1;
    if (kindFilter && k !== kindFilter) {
      continue;
    }

    // 2. Year & Date Range filters
    let itemDateMs = NaN;
    let itemYear: number | null = null;
    if (item.createdAt) {
      const parsed = new Date(item.createdAt).getTime();
      if (!Number.isNaN(parsed)) {
        itemDateMs = parsed;
        itemYear = new Date(parsed).getUTCFullYear();
        byYear[itemYear] = (byYear[itemYear] || 0) + 1;
      }
    }

    if (yearFilter !== null && itemYear !== yearFilter) {
      continue;
    }
    if (createdFromMs !== null && (!itemDateMs || itemDateMs < createdFromMs)) {
      continue;
    }
    if (createdToMs !== null && (!itemDateMs || itemDateMs > createdToMs)) {
      continue;
    }

    // 3. Period ID filter
    if (periodFilter) {
      const itemPeriod = (item.provenance as any)?.dateWindowId || (item.extra as any)?.periodId;
      if (itemPeriod !== periodFilter) {
        continue;
      }
    }

    // 4. Has Description filter
    if (criteria.hasDescription === true && (!item.description || item.description.trim().length === 0)) {
      continue;
    }

    // 5. Has Tags filter
    if (criteria.hasTags === true && (!item.tags || item.tags.length === 0)) {
      continue;
    }

    // 6. Duration range filter
    if (durationRange !== "all") {
      const d = item.duration ?? 0;
      if (durationRange === "short" && (d <= 0 || d >= 300)) continue; // < 5 min
      if (durationRange === "medium" && (d < 300 || d > 1200)) continue; // 5 - 20 min
      if (durationRange === "long" && d <= 1200) continue; // > 20 min
    }

    // 7. Views range filter
    if (viewsRange !== "all") {
      const v = item.views ?? 0;
      if (viewsRange === "under_1k" && v >= 1000) continue;
      if (viewsRange === "1k_10k" && (v < 1000 || v >= 10000)) continue;
      if (viewsRange === "10k_100k" && (v < 10000 || v >= 100000)) continue;
      if (viewsRange === "over_100k" && v < 100000) continue;
    }

    // 8. Text Match filter
    const { matches, score } = itemMatchesQuery(item, queryTokens);
    if (!matches) {
      continue;
    }

    scoredMatches.push({ item, score });
  }

  // 9. Sorting
  scoredMatches.sort((a, b) => {
    if (sortBy === "relevance") {
      if (b.score !== a.score) return b.score - a.score;
      // Secondary sort: newest
      const tA = a.item.createdAt ? new Date(a.item.createdAt).getTime() : 0;
      const tB = b.item.createdAt ? new Date(b.item.createdAt).getTime() : 0;
      return tB - tA;
    }
    if (sortBy === "newest") {
      const tA = a.item.createdAt ? new Date(a.item.createdAt).getTime() : 0;
      const tB = b.item.createdAt ? new Date(b.item.createdAt).getTime() : 0;
      return tB - tA;
    }
    if (sortBy === "oldest") {
      const tA = a.item.createdAt ? new Date(a.item.createdAt).getTime() : 0;
      const tB = b.item.createdAt ? new Date(b.item.createdAt).getTime() : 0;
      return tA - tB;
    }
    if (sortBy === "views_desc") {
      return (b.item.views || 0) - (a.item.views || 0);
    }
    if (sortBy === "views_asc") {
      return (a.item.views || 0) - (b.item.views || 0);
    }
    if (sortBy === "duration_desc") {
      return (b.item.duration || 0) - (a.item.duration || 0);
    }
    if (sortBy === "duration_asc") {
      return (a.item.duration || 0) - (b.item.duration || 0);
    }
    if (sortBy === "title_asc") {
      return (a.item.title || "").localeCompare(b.item.title || "");
    }
    if (sortBy === "title_desc") {
      return (b.item.title || "").localeCompare(a.item.title || "");
    }
    return 0;
  });

  const duration = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    items: scoredMatches.map((m) => m.item),
    totalMatched: scoredMatches.length,
    totalInCatalog: items.length,
    searchDurationMs: duration,
    facetCounts: {
      byKind,
      byYear,
    },
  };
}
