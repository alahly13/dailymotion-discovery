// Local Catalog Search Bar — Professional Zero-API-Call Real-Time Search & Filtering (2026)
//
// What this controls: Dedicated, accessible search bar and filter controls for the locally
// retrieved channel/playlist catalog. Operates completely offline with 100% ZERO network calls
// to Dailymotion API or Gemini. Supports English, Arabic, diacritics stripping, multi-word matching,
// keyboard shortcut `/`, clear button, and composable filter chips.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Calendar,
  Check,
  Clock,
  Eye,
  Filter,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Tv,
  X,
} from "lucide-react";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  searchLocalCatalog,
  type LocalCatalogSearchCriteria,
  type LocalCatalogSearchResult,
} from "@/lib/link-explorer/local-catalog-search-service";
import { cn } from "@/lib/utils/cn";

export interface LocalCatalogSearchBarProps {
  items: DiscoveryItem[];
  onFilteredItemsChange: (result: LocalCatalogSearchResult) => void;
  availableYears?: number[];
  isCrawling?: boolean;
}

export function LocalCatalogSearchBar({
  items,
  onFilteredItemsChange,
  availableYears = [],
  isCrawling = false,
}: LocalCatalogSearchBarProps) {
  const [, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState<"all" | "video" | "channel" | "playlist" | "livestream">("all");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [durationRange, setDurationRange] = useState<"all" | "short" | "medium" | "long">("all");
  const [viewsRange, setViewsRange] = useState<"all" | "under_1k" | "1k_10k" | "10k_100k" | "over_100k">("all");
  const [sortBy, setSortBy] = useState<
    "relevance" | "newest" | "oldest" | "views_desc" | "views_asc" | "duration_desc" | "duration_asc" | "title_asc" | "title_desc"
  >("newest");
  const [hasDescription, setHasDescription] = useState(false);
  const [hasTags, setHasTags] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Compute search results reactively whenever query, filters, or catalog items change
  const searchResult = useRef<LocalCatalogSearchResult>({
    items: [],
    totalMatched: 0,
    totalInCatalog: 0,
    searchDurationMs: 0,
    facetCounts: { byKind: {}, byYear: {} },
  });

  useEffect(() => {
    const criteria: LocalCatalogSearchCriteria = {
      query: query.trim() || undefined,
      kind: selectedKind,
      year: selectedYear,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      durationRange,
      viewsRange,
      sortBy,
      hasDescription: hasDescription ? true : undefined,
      hasTags: hasTags ? true : undefined,
    };

    const res = searchLocalCatalog(items, criteria);
    searchResult.current = res;
    startTransition(() => {
      onFilteredItemsChange(res);
    });
  }, [
    items,
    query,
    selectedKind,
    selectedYear,
    createdFrom,
    createdTo,
    durationRange,
    viewsRange,
    sortBy,
    hasDescription,
    hasTags,
    onFilteredItemsChange,
  ]);

  // Global keyboard shortcut: Press `/` to focus search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      } else if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        if (query) {
          setQuery("");
        } else {
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query]);

  const handleResetFilters = () => {
    setQuery("");
    setSelectedKind("all");
    setSelectedYear(null);
    setCreatedFrom("");
    setCreatedTo("");
    setDurationRange("all");
    setViewsRange("all");
    setSortBy("newest");
    setHasDescription(false);
    setHasTags(false);
  };

  const hasActiveFilters =
    Boolean(query) ||
    selectedKind !== "all" ||
    selectedYear !== null ||
    Boolean(createdFrom) ||
    Boolean(createdTo) ||
    durationRange !== "all" ||
    viewsRange !== "all" ||
    sortBy !== "newest" ||
    hasDescription ||
    hasTags;

  const res = searchResult.current;

  return (
    <div className="w-full rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
      {/* Top Search Input & Readout Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LOCAL CATALOG SEARCH · ZERO API CALLS
          </span>
          {isCrawling && (
            <span className="text-[11px] font-bold text-amber-500 animate-pulse">
              (Live Indexing in background...)
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
          <span>
            Showing <strong className="text-foreground">{res.totalMatched.toLocaleString()}</strong> of{" "}
            <strong>{items.length.toLocaleString()}</strong> retrieved records
          </span>
          {res.searchDurationMs > 0 && (
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              ({res.searchDurationMs}ms)
            </span>
          )}
        </div>
      </div>

      {/* Main Search Input */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-muted-foreground">
          <Search className="h-4 w-4" />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search retrieved catalog by title, description, tags, video ID... (Arabic & English supported)"
          className="w-full h-11 pl-10 pr-20 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-2xs"
        />
        <div className="absolute right-3 flex items-center gap-1.5">
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
              title="Clear search query (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-surface-muted text-[10px] font-mono text-muted-foreground">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Filter Chips Bar (Kinds & Quick Actions) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 text-xs">
        {/* Kind Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedKind("all")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
              selectedKind === "all"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedKind("video")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
              selectedKind === "video"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            Videos ({items.filter((it) => it.kind === "video").length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedKind("playlist")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
              selectedKind === "playlist"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            Playlists ({items.filter((it) => it.kind === "playlist").length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedKind("livestream")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
              selectedKind === "livestream"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            Live ({items.filter((it) => (it.kind as string) === "live" || (it.kind as string) === "livestream").length})
          </button>
        </div>

        {/* Sorting & Advanced Filter Toggle */}
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-8 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground font-medium outline-none cursor-pointer focus:ring-1 focus:ring-primary"
          >
            <option value="relevance">Sort: Best Match</option>
            <option value="newest">Sort: Newest Created</option>
            <option value="oldest">Sort: Oldest Created</option>
            <option value="views_desc">Sort: Most Viewed</option>
            <option value="views_asc">Sort: Least Viewed</option>
            <option value="duration_desc">Sort: Longest Duration</option>
            <option value="duration_asc">Sort: Shortest Duration</option>
            <option value="title_asc">Sort: Title A &rarr; Z</option>
            <option value="title_desc">Sort: Title Z &rarr; A</option>
          </select>

          {/* Advanced Filters Expand Toggle */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors cursor-pointer",
              advancedOpen || hasActiveFilters
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters {hasActiveFilters && "•"}
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Advanced Collapsible Filter Panel */}
      {advancedOpen && (
        <div className="rounded-xl border border-border/70 bg-surface/70 p-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Year Selector */}
            {availableYears.length > 0 && (
              <div className="space-y-1">
                <label className="font-bold text-muted-foreground block">Creation Year</label>
                <select
                  value={selectedYear ?? ""}
                  onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground cursor-pointer"
                >
                  <option value="">All Years</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Duration Range */}
            <div className="space-y-1">
              <label className="font-bold text-muted-foreground block">Video Duration</label>
              <select
                value={durationRange}
                onChange={(e) => setDurationRange(e.target.value as any)}
                className="w-full h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground cursor-pointer"
              >
                <option value="all">Any Duration</option>
                <option value="short">Short (&lt; 5 min)</option>
                <option value="medium">Medium (5 – 20 min)</option>
                <option value="long">Long (&gt; 20 min)</option>
              </select>
            </div>

            {/* Views Tier */}
            <div className="space-y-1">
              <label className="font-bold text-muted-foreground block">View Count Tier</label>
              <select
                value={viewsRange}
                onChange={(e) => setViewsRange(e.target.value as any)}
                className="w-full h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground cursor-pointer"
              >
                <option value="all">Any View Count</option>
                <option value="under_1k">Under 1,000 views</option>
                <option value="1k_10k">1,000 – 10,000 views</option>
                <option value="10k_100k">10,000 – 100,000 views</option>
                <option value="over_100k">Over 100,000 views</option>
              </select>
            </div>

            {/* Custom Date Range (Created From / To) */}
            <div className="space-y-1">
              <label className="font-bold text-muted-foreground block">Created Date (UTC)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(e) => setCreatedFrom(e.target.value)}
                  className="w-1/2 h-8 rounded-lg border border-border bg-card px-2 text-[11px] text-foreground font-mono"
                  title="Created From Date"
                />
                <span className="text-muted-foreground">&rarr;</span>
                <input
                  type="date"
                  value={createdTo}
                  onChange={(e) => setCreatedTo(e.target.value)}
                  className="w-1/2 h-8 rounded-lg border border-border bg-card px-2 text-[11px] text-foreground font-mono"
                  title="Created To Date"
                />
              </div>
            </div>
          </div>

          {/* Checkboxes: Has Description, Has Tags */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
              <input
                type="checkbox"
                checked={hasDescription}
                onChange={(e) => setHasDescription(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              Has Description
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
              <input
                type="checkbox"
                checked={hasTags}
                onChange={(e) => setHasTags(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              Has Tags
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
