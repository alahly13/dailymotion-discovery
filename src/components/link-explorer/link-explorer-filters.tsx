// Link Explorer Filters & Capability Indicators — Server vs Local Discipline (2026)
//
// What this controls: Sorting and filtering for Link Explorer with clear, unmistakable visual badges
// for API capabilities (API V1, API V2, LOCAL ONLY · ZERO API CALLS, UNAVAILABLE).
// Features a dedicated prominent local title search field filtering all retrieved records without network calls.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useState } from "react";
import {
  Clock,
  Eye,
  Filter,
  Layers,
  ListFilter,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type { ApiVersion } from "@/lib/discovery/types";
import { cn } from "@/lib/utils/cn";

export type LocalSortOption =
  | "api_order"
  | "newest"
  | "oldest"
  | "views_desc"
  | "views_asc"
  | "duration_desc"
  | "duration_asc"
  | "title_asc"
  | "title_desc"
  | "engagement_desc";

export interface LocalFilterCriteria {
  titleSearch: string;
  searchQuery: string;
  durationRange: "all" | "short" | "medium" | "long";
  viewsRange: "all" | "under_1k" | "1k_10k" | "10k_100k" | "over_100k";
  year: number | null;
}

export interface LinkExplorerFiltersProps {
  version: ApiVersion;
  serverSort: string;
  onChangeServerSort: (sort: string) => void;
  localSort: LocalSortOption;
  onChangeLocalSort: (sort: LocalSortOption) => void;
  filters: LocalFilterCriteria;
  onChangeFilters: (filters: LocalFilterCriteria) => void;
  totalLoadedItems: number;
  totalVisibleItems: number;
  availableYears: number[];
  isPartiallyFetched?: boolean;
}

export function LinkExplorerFilters({
  version,
  serverSort,
  onChangeServerSort,
  localSort,
  onChangeLocalSort,
  filters,
  onChangeFilters,
  totalLoadedItems,
  totalVisibleItems,
  availableYears,
  isPartiallyFetched = false,
}: LinkExplorerFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount =
    (filters.titleSearch ? 1 : 0) +
    (filters.searchQuery ? 1 : 0) +
    (filters.durationRange !== "all" ? 1 : 0) +
    (filters.viewsRange !== "all" ? 1 : 0) +
    (filters.year !== null ? 1 : 0) +
    (localSort !== "api_order" ? 1 : 0);

  const handleResetFilters = () => {
    onChangeFilters({
      titleSearch: "",
      searchQuery: "",
      durationRange: "all",
      viewsRange: "all",
      year: null,
    });
    onChangeLocalSort("api_order");
  };

  return (
    <div className="space-y-3">
      {/* 1. Primary Filter & Sort Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
        {/* Left: Summary Counter and Toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all cursor-pointer shadow-2xs",
              isOpen
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-foreground hover:bg-surface-muted"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Local Filters</span>
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-black text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <span className="text-xs text-muted-foreground font-medium">
            Showing <strong className="text-foreground">{totalVisibleItems}</strong> of{" "}
            <strong className="text-foreground">{totalLoadedItems}</strong> retrieved items
          </span>

          <span className="hidden sm:inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            LOCAL ONLY · ZERO API CALLS
          </span>
        </div>

        {/* Right: Instant Local Sorting Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-muted-foreground">
            Sort:
          </label>
          <select
            value={localSort}
            onChange={(e) => onChangeLocalSort(e.target.value as LocalSortOption)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
          >
            <option value="api_order">API Order (Default)</option>
            <option value="newest">Newest First (Chronological)</option>
            <option value="oldest">Oldest First (Chronological)</option>
            <option value="views_desc">Most Viewed (Views Total)</option>
            <option value="views_asc">Least Viewed (Views Total)</option>
            <option value="duration_desc">Longest Duration</option>
            <option value="duration_asc">Shortest Duration</option>
            <option value="title_asc">Title: A to Z</option>
            <option value="title_desc">Title: Z to A</option>
            <option value="engagement_desc">Engagement (Likes / Views)</option>
          </select>
        </div>
      </div>

      {/* 2. Full-Width Collapsible Local Filters Panel */}
      {isOpen && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
          {/* Header Row */}
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <ListFilter className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                In-Memory Filter Engine (Zero API Calls)
              </h4>
            </div>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reset All Local Filters
              </button>
            )}
          </div>

          {/* DEDICATED PROMINENT LOCAL TITLE SEARCH FIELD (Section 9 Requirement) */}
          <div className="rounded-xl border border-primary/30 bg-surface/80 p-4 space-y-2.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-primary" />
                Search titles in retrieved results
              </label>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  LOCAL ONLY · ZERO API CALLS
                </span>
                <span className="text-xs text-muted-foreground font-mono font-semibold">
                  Showing <strong className="text-primary">{totalVisibleItems}</strong> of <strong className="text-foreground">{totalLoadedItems}</strong> retrieved records
                </span>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                value={filters.titleSearch}
                onChange={(e) =>
                  onChangeFilters({ ...filters, titleSearch: e.target.value })
                }
                placeholder="Type a video title to filter the loaded catalog..."
                className="w-full h-10 rounded-lg border border-border bg-card px-3.5 pr-10 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary shadow-2xs font-medium"
              />
              {filters.titleSearch && (
                <button
                  type="button"
                  onClick={() => onChangeFilters({ ...filters, titleSearch: "" })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
                  title="Clear title search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {isPartiallyFetched && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium pt-0.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                Filtering across the {totalLoadedItems} locally retrieved records. Videos not yet retrieved from Dailymotion are not included in this search.
              </p>
            )}
          </div>

          {/* Secondary In-Memory Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {/* Filter 1: General metadata search (tags, desc, owner) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                Deep Metadata Filter
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={filters.searchQuery}
                  onChange={(e) =>
                    onChangeFilters({ ...filters, searchQuery: e.target.value })
                  }
                  placeholder="Filter by description, tag, owner..."
                  className="w-full h-9 rounded-lg border border-border bg-surface px-3 pr-8 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
                />
                {filters.searchQuery && (
                  <button
                    type="button"
                    onClick={() => onChangeFilters({ ...filters, searchQuery: "" })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Matches description, tags, and owner name.
              </p>
            </div>

            {/* Filter 2: Duration Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Duration Range
              </label>
              <select
                value={filters.durationRange}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    durationRange: e.target.value as LocalFilterCriteria["durationRange"],
                  })
                }
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value="all">Any Duration</option>
                <option value="short">Short (&lt; 5 minutes)</option>
                <option value="medium">Medium (5 – 20 minutes)</option>
                <option value="long">Long (&gt; 20 minutes)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                Filters video length in seconds.
              </p>
            </div>

            {/* Filter 3: Views Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-primary" />
                View Count
              </label>
              <select
                value={filters.viewsRange}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    viewsRange: e.target.value as LocalFilterCriteria["viewsRange"],
                  })
                }
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value="all">Any Views</option>
                <option value="under_1k">&lt; 1,000 views</option>
                <option value="1k_10k">1,000 – 10,000 views</option>
                <option value="10k_100k">10,000 – 100,000 views</option>
                <option value="over_100k">&gt; 100,000 views</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                Filters by reported views_total.
              </p>
            </div>

            {/* Filter 4: Year Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Publication Year
              </label>
              <select
                value={filters.year ?? ""}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    year: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value="">All Years</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Year {yr}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Extracted from video creation timestamps.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
