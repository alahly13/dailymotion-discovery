"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VideoResultsGrid } from "@/components/video/video-results-grid";
import { buildVideoSearchIndex, searchVideoIndex } from "@/lib/search/video-flexsearch";
import type {
  ChannelCoverage,
  ChannelSourceSummary,
  FetchHistoryEntry,
  SavedChannelResultScope,
  SavedChannelSearchResponse,
  SavedChannelSort,
} from "@/types/channel-fetch";
import type { NormalizedVideoMetadata } from "@/types/video";

type SearchMode = "server" | "loaded-index";

const sortOptions: Array<{ value: SavedChannelSort; label: string }> = [
  { value: "first_collected", label: "First collected" },
  { value: "newest", label: "Newest published" },
  { value: "oldest", label: "Oldest published" },
  { value: "views_desc", label: "Most viewed" },
  { value: "duration_desc", label: "Longest duration" },
  { value: "title_asc", label: "Title A-Z" },
];

function exportItems(source: ChannelSourceSummary | null, items: NormalizedVideoMetadata[], format: "json" | "ndjson") {
  const body = format === "ndjson"
    ? items.map((video) => JSON.stringify({ type: "video", source, video })).join("\n")
    : JSON.stringify({ exportedAt: new Date().toISOString(), source, videos: items }, null, 2);
  const blob = new Blob([body], { type: format === "ndjson" ? "application/x-ndjson" : "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dailymotion-channel-manifest.${format === "ndjson" ? "ndjson" : "json"}`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SavedChannelManifestBrowser({
  source,
  coverage,
  history,
  initialItems,
  initialTotal,
  initialLimit,
  initialOffset,
  initialSort,
}: {
  source: ChannelSourceSummary | null;
  coverage: ChannelCoverage | null;
  history: FetchHistoryEntry[];
  initialItems: NormalizedVideoMetadata[];
  initialTotal: number;
  initialLimit: number;
  initialOffset: number;
  initialSort: SavedChannelSort;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [offset, setOffset] = useState(initialOffset);
  const [limit] = useState(initialLimit);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SavedChannelResultScope>("combined");
  const [attemptId, setAttemptId] = useState(history[0]?.id ?? "");
  const [sort, setSort] = useState<SavedChannelSort>(initialSort);
  const [exactPhrase, setExactPhrase] = useState(false);
  const [fuzzy, setFuzzy] = useState(true);
  const [mode, setMode] = useState<SearchMode>("server");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedIndex = useMemo(() => buildVideoSearchIndex(items), [items]);
  const loadedIndexItems = useMemo(() => {
    // The loaded FlexSearch index is deliberately scoped to the current page of
    // saved DB results. It gives instant multilingual filtering without silently
    // fetching more from Dailymotion or pretending every stored row is in memory.
    return searchVideoIndex(loadedIndex, query, { exactPhrase, fuzzy, limit: 200 });
  }, [exactPhrase, fuzzy, loadedIndex, query]);

  const displayItems = mode === "loaded-index" ? loadedIndexItems : items;
  const canPageBack = offset > 0 && mode === "server";
  const canPageForward = offset + items.length < total && mode === "server";

  async function runServerSearch(nextOffset = 0) {
    if (!source) return;
    setSearching(true);
    setError(null);
    setMode("server");

    try {
      const response = await fetch("/api/dailymotion/channel/search-saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          query,
          scope,
          attemptId: scope === "attempt" ? attemptId : null,
          limit,
          offset: nextOffset,
          sort,
          exactPhrase,
          fuzzy,
        }),
      });
      const data = (await response.json()) as SavedChannelSearchResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Saved search failed.");
      setItems(data.items);
      setTotal(data.total);
      setOffset(data.offset);
      setSort(data.sort);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-5" id="search">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
              <Search className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Saved Results Search</p>
              <h2 className="mt-1 text-2xl font-black">Combined Manifest Browser</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              Search runs against persisted channel results. Server search covers the saved database page request; loaded-index search uses FlexSearch over the videos already loaded below.
            </p>
            </div>
          </div>
          <div className="action-row">
            <Button type="button" variant="secondary" onClick={() => exportItems(source, displayItems, "json")}>
              <Download className="h-4 w-4" aria-hidden="true" />
              JSON
            </Button>
            <Button type="button" variant="secondary" onClick={() => exportItems(source, displayItems, "ndjson")}>
              <Download className="h-4 w-4" aria-hidden="true" />
              NDJSON
            </Button>
          </div>
        </div>

        <div className="control-grid">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, الوصف, owner, tags, year, duration, views, attempt..." />
          <select value={scope} onChange={(event) => setScope(event.target.value as SavedChannelResultScope)} className="min-h-11 min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--ring)]">
            <option value="combined">Combined Results</option>
            <option value="attempt">Selected Attempt</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as SavedChannelSort)} className="min-h-11 min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--ring)]">
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        {scope === "attempt" ? (
          <select value={attemptId} onChange={(event) => setAttemptId(event.target.value)} className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--ring)]">
            {history.map((entry) => (
              <option key={entry.id} value={entry.id}>
                Attempt #{entry.attemptNumber} - {entry.status} - {entry.uniqueItemsCollected} unique
              </option>
            ))}
          </select>
        ) : null}

        <div className="chip-row items-center">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
            <input type="checkbox" checked={exactPhrase} onChange={(event) => setExactPhrase(event.target.checked)} />
            Exact phrase
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
            <input type="checkbox" checked={fuzzy} onChange={(event) => setFuzzy(event.target.checked)} />
            Typo tolerant loaded index
          </label>
          <Button type="button" onClick={() => runServerSearch(0)} disabled={searching || !source}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
            Search Saved DB
          </Button>
          <Button type="button" variant={mode === "loaded-index" ? "primary" : "secondary"} onClick={() => setMode("loaded-index")}>
            Search Loaded Results
          </Button>
        </div>

        {error ? <div className="rounded-md border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] p-3 text-sm font-semibold text-[var(--error)]">{error}</div> : null}
        <div className="metric-grid text-sm text-[var(--muted-foreground)]">
          <span className="metric-tile">{displayItems.length} shown</span>
          <span className="metric-tile">{mode === "server" ? `${total} saved matches` : `${items.length} loaded videos indexed`}</span>
          <span className="metric-tile">Coverage: {coverage?.coverageStatus ?? "unknown"} {coverage?.coveragePercent !== null && coverage?.coveragePercent !== undefined ? `(${coverage.coveragePercent}%)` : ""}</span>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-anywhere text-sm text-[var(--muted-foreground)]">
          Page offset {offset}. Server pagination is used for large saved catalogs.
        </div>
        <div className="action-row">
          <Button type="button" variant="secondary" disabled={!canPageBack || searching} onClick={() => runServerSearch(Math.max(0, offset - limit))}>Previous</Button>
          <Button type="button" variant="secondary" disabled={!canPageForward || searching} onClick={() => runServerSearch(offset + limit)}>Next</Button>
        </div>
      </div>

      <VideoResultsGrid items={displayItems} resultViewMode={scope === "attempt" ? "by-attempt" : "combined"} />
    </div>
  );
}
