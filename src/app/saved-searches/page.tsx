"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, BookmarkCheck, Download, Pin, Play, Search, Trash2 } from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";

/**
 * Saved Search Presets Manager (`/saved-searches`).
 *
 * Explicitly separates:
 *   1. Re-run Live API Query -> executes Dailymotion API fetch with saved query + params.
 *   2. Reload Cached Snapshot Offline -> zero API calls when a cached result snapshot exists.
 */
export default function SavedSearchesPage() {
  const merged = useMergedDataset();
  const [filterText, setFilterText] = useState("");
  const [versionFilter, setVersionFilter] = useState<"all" | "v1" | "v2">("all");

  const visiblePresets = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return merged.savedSearches.filter((p) => {
      if (versionFilter !== "all" && p.apiVersion !== versionFilter) return false;
      if (!needle) return true;
      return `${p.name} ${p.query} ${p.resource} ${p.tags.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [merged.savedSearches, filterText, versionFilter]);

  function buildLiveSearchHref(preset: (typeof merged.savedSearches)[number]): string {
    const sp = new URLSearchParams();
    sp.set("v", preset.apiVersion);
    if (preset.query) sp.set("q", preset.query);
    for (const [k, v] of Object.entries(preset.apiParams ?? {})) {
      if (v) sp.set(k, v);
    }
    return `/search?${sp.toString()}`;
  }

  function exportAllPresets() {
    const blob = new Blob([JSON.stringify(merged.savedSearches, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dailymotion-saved-search-presets.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            Workspace · Presets & Offline Snapshots
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Saved Search Presets</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">
            Reuse saved Dailymotion v1 and v2 search configurations. Choose between executing a fresh live API request
            or opening the captured offline snapshot without burning quota.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={merged.savedSearches.length === 0}
            onClick={exportAllPresets}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Export Presets JSON
          </button>
          <Link
            href="/search"
            className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-xs font-black uppercase text-primary-foreground hover:opacity-90"
          >
            + New Search
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter presets by title, query, resource, or tag..."
            className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] pr-3 pl-9 text-xs font-semibold"
          />
        </div>
        <select
          aria-label="Filter presets by API version"
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value as "all" | "v1" | "v2")}
          className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-black uppercase"
        >
          <option value="all">All Versions</option>
          <option value="v1">API v1 Only</option>
          <option value="v2">API v2 Only</option>
        </select>
      </div>

      {visiblePresets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <BookmarkCheck className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" aria-hidden="true" />
          <p className="mt-3 text-base font-black">No saved search presets match</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Run any search in Unified Search or v1/v2 Explorer and click &quot;Save search&quot;.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visiblePresets.map((preset) => {
            const snapCount = preset.cachedSnapshot?.items?.length ?? 0;
            return (
              <article
                key={preset.id}
                className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase">
                      <span
                        className={`rounded border px-2 py-0.5 ${
                          preset.apiVersion === "v2"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
                        }`}
                      >
                        {preset.apiVersion} · {preset.resource}
                      </span>
                      {preset.pinned && (
                        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-300">
                          Pinned
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title={preset.pinned ? "Unpin preset" : "Pin preset"}
                        onClick={() => void merged.coordinator.togglePinSearchPreset(preset.id)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded border ${
                          preset.pinned
                            ? "border-amber-500 text-amber-500"
                            : "border-[var(--border)] text-[var(--muted-foreground)]"
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="Delete preset"
                        onClick={() => void merged.coordinator.deleteSearchPreset(preset.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <h2 className="mt-2 text-lg font-black">{preset.name}</h2>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Query: <code className="font-mono text-[var(--foreground)]">{preset.query || "(filter-only)"}</code>
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                    API Filters: {Object.keys(preset.apiParams ?? {}).length} ·{" "}
                    {snapCount > 0
                      ? `Cached Snapshot: ${snapCount} items (${new Date(preset.cachedSnapshot!.capturedAt).toLocaleDateString()})`
                      : "No offline snapshot captured"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                  <Link
                    href={buildLiveSearchHref(preset)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-black uppercase text-primary-foreground hover:opacity-90"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    Re-run Live API Query
                  </Link>
                  {snapCount > 0 && (
                    <Link
                      href={`/search?snapshotType=preset&snapshotId=${encodeURIComponent(preset.id)}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Reload Snapshot Offline ({snapCount})
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
