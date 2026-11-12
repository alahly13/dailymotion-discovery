"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Code2, Download, History, Play, Search, Trash2 } from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";

/**
 * Search History Explorer (`/history`).
 *
 * Inspect historical queries across v1 and v2, inspect full submitted parameter JSON,
 * re-run live against Dailymotion API, or reopen captured offline result snapshots.
 */
export default function SearchHistoryPage() {
  const merged = useMergedDataset();
  const [needle, setNeedle] = useState("");
  const [versionFilter, setVersionFilter] = useState<"all" | "v1" | "v2">("all");
  const [rawTarget, setRawTarget] = useState<{ title: string; payload: unknown } | null>(null);

  const visibleHistory = useMemo(() => {
    const q = needle.trim().toLowerCase();
    return merged.searchHistory.filter((entry) => {
      if (versionFilter !== "all" && entry.apiVersion !== versionFilter) return false;
      if (!q) return true;
      return `${entry.query} ${entry.resource} ${JSON.stringify(entry.apiParams)}`.toLowerCase().includes(q);
    });
  }, [merged.searchHistory, needle, versionFilter]);

  function exportHistoryJson() {
    const blob = new Blob([JSON.stringify(visibleHistory, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dailymotion-search-history.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            Workspace · Telemetry & Audit Log
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Search History Explorer</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">
            Every submitted v1/v2 search is logged once (pagination appends do not duplicate history rows) along with
            parameter snapshots for offline inspection and zero-quota replay.
          </p>
        </div>
        <button
          type="button"
          disabled={visibleHistory.length === 0}
          onClick={exportHistoryJson}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Export History JSON
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            type="search"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder="Search inside history queries, resource kinds, or parameter values..."
            className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] pr-3 pl-9 text-xs font-semibold"
          />
        </div>
        <select
          aria-label="Filter history by API version"
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value as "all" | "v1" | "v2")}
          className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-black uppercase"
        >
          <option value="all">All Versions ({merged.searchHistory.length})</option>
          <option value="v1">API v1</option>
          <option value="v2">API v2</option>
        </select>
      </div>

      {visibleHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <History className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" aria-hidden="true" />
          <p className="mt-3 text-base font-black">No matching search history recorded</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleHistory.map((h) => {
            const snapCount = h.snapshotItems?.length ?? 0;
            const liveParams = new URLSearchParams({ v: h.apiVersion });
            if (h.query) liveParams.set("q", h.query);
            for (const [k, v] of Object.entries(h.apiParams ?? {})) {
              if (v && k !== "cacheKey") liveParams.set(k, v);
            }

            return (
              <article
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase">
                    <span
                      className={`rounded border px-2 py-0.5 ${
                        h.apiVersion === "v2"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
                      }`}
                    >
                      {h.apiVersion} · {h.resource} ({h.mode})
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      {new Date(h.submittedAt).toLocaleString()}
                    </span>
                    <span className="text-[var(--muted-foreground)]">· {h.resultCount} result(s)</span>
                  </div>
                  <p className="mt-1.5 font-black text-base">
                    {h.query || "(Filter / Profile browse query)"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRawTarget({ title: `History Entry: ${h.query || h.id}`, payload: h })}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-bold"
                  >
                    <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> Params JSON
                  </button>
                  {snapCount > 0 && (
                    <Link
                      href={`/search?snapshotType=history&snapshotId=${encodeURIComponent(h.id)}`}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-black uppercase hover:border-[var(--primary)]"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Offline Snapshot ({snapCount})
                    </Link>
                  )}
                  <Link
                    href={`/search?${liveParams.toString()}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[var(--primary)] px-3 text-xs font-black uppercase text-white"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" /> Re-run Live
                  </Link>
                  <button
                    type="button"
                    title="Delete entry"
                    onClick={() => void merged.coordinator.deleteSearchHistoryEntry(h.id)}
                    className="inline-flex min-h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <RawJsonDrawer
        open={rawTarget !== null}
        title={rawTarget?.title ?? ""}
        payload={rawTarget?.payload}
        onClose={() => setRawTarget(null)}
      />
    </div>
  );
}
