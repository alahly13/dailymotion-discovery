"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Calendar,
  Check,
  Clock,
  Code2,
  Copy,
  Download,
  Eye,
  Filter,
  History,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  cleanExpiredSearchSnapshots,
  getSearchSnapshotPages,
  listSearchSnapshots,
  type LocalSearchSnapshotPageRecord,
  type LocalSearchSnapshotRecord,
} from "@/lib/local-first/indexeddb-store";
import { removeSearchSnapshot } from "@/lib/search-history/search-snapshot-service";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";

function formatExpiryTime(expiresAt: number): string {
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) return "Expired";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `Expires in ${days}d ${hours}h`;
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `Expires in ${hours}h ${mins}m`;
}

function getDateGroup(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && date.getDate() === now.getDate()) return "Today";
  if (diffDays <= 1) return "Yesterday";
  if (diffDays <= 7) return "Earlier This Week";
  if (diffDays <= 30) return "Earlier This Month";
  return "Older";
}

export default function SearchHistoryPage() {
  const [snapshots, setSnapshots] = useState<LocalSearchSnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [versionFilter, setVersionFilter] = useState<"ALL" | "v1" | "v2">("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rawTarget, setRawTarget] = useState<{ title: string; payload: unknown } | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const loadSnapshots = async () => {
    try {
      setLoading(true);
      const list = await listSearchSnapshots({ includeExpired: false });
      setSnapshots(list);
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshots();
  }, []);

  const handleDelete = async (id: string) => {
    await removeSearchSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    setFlashMessage("Snapshot deleted from IndexedDB");
    setTimeout(() => setFlashMessage(null), 2000);
  };

  const handlePruneExpired = async () => {
    const pruned = await cleanExpiredSearchSnapshots();
    await loadSnapshots();
    setFlashMessage(`Cleaned up ${pruned} expired snapshot(s)`);
    setTimeout(() => setFlashMessage(null), 2500);
  };

  const handleCopyQuery = async (query: string, id: string) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Blocked
    }
  };

  const handleInspectRaw = async (snapshot: LocalSearchSnapshotRecord) => {
    try {
      const pages = await getSearchSnapshotPages(snapshot.id);
      setRawTarget({
        title: `Search Snapshot: ${snapshot.query || snapshot.id}`,
        payload: {
          snapshot,
          pages: pages.map((p: LocalSearchSnapshotPageRecord) => ({
            pageIndex: p.pageIndex,
            capturedAt: p.capturedAt,
            rawJson: p.rawJson,
          })),
        },
      });
    } catch {
      // Failed to load
    }
  };

  const filteredSnapshots = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return snapshots.filter((s) => {
      if (versionFilter !== "ALL" && s.apiVersion !== versionFilter) return false;
      if (!term) return true;
      return (
        s.query.toLowerCase().includes(term) ||
        s.route.toLowerCase().includes(term) ||
        (s.previewTitles && s.previewTitles.some((t) => t.toLowerCase().includes(term)))
      );
    });
  }, [snapshots, searchTerm, versionFilter]);

  // Group snapshots chronologically
  const groupedSnapshots = useMemo(() => {
    const groups: Record<string, LocalSearchSnapshotRecord[]> = {
      Today: [],
      Yesterday: [],
      "Earlier This Week": [],
      "Earlier This Month": [],
      Older: [],
    };

    for (const snap of filteredSnapshots) {
      const g = getDateGroup(snap.capturedAt);
      if (!groups[g]) groups[g] = [];
      groups[g].push(snap);
    }

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredSnapshots]);

  const exportAllSnapshots = () => {
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailymotion-search-snapshots-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--primary)]">
              Local-First IndexedDB
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
              Zero Media Downloads
            </span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black">Search History & Raw API Snapshots</h1>
          <p className="mt-1 text-xs text-[var(--muted-foreground)] max-w-2xl">
            Every search executed across Unified Search, Video Discovery, Channel Explorer, and AI Search is automatically
            captured with full raw API JSON for offline result replay with ZERO API calls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handlePruneExpired()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
            title="Clean up snapshots older than TTL"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Purge Expired</span>
          </button>
          <button
            type="button"
            disabled={snapshots.length === 0}
            onClick={exportAllSnapshots}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold hover:border-[var(--primary)] disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Snapshots</span>
          </button>
        </div>
      </section>

      {flashMessage && (
        <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-2 text-xs font-bold text-emerald-500" role="status">
          ✓ {flashMessage}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs">
        <div className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search saved search history by query, route, or titles..."
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] pl-9 pr-3 text-xs font-semibold"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setVersionFilter("ALL")}
            className={`rounded px-2.5 py-1 ${
              versionFilter === "ALL" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"
            }`}
          >
            All ({snapshots.length})
          </button>
          <button
            type="button"
            onClick={() => setVersionFilter("v1")}
            className={`rounded px-2.5 py-1 ${
              versionFilter === "v1" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"
            }`}
          >
            V1
          </button>
          <button
            type="button"
            onClick={() => setVersionFilter("v2")}
            className={`rounded px-2.5 py-1 ${
              versionFilter === "v2" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"
            }`}
          >
            V2
          </button>
        </div>
      </div>

      {/* Snapshot Cards List */}
      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
          <p className="text-xs font-bold text-[var(--muted-foreground)]">Loading IndexedDB search history…</p>
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 p-8 text-center">
          <History className="h-10 w-10 text-[var(--muted-foreground)]/40 mb-3" />
          <h2 className="text-base font-bold">No search history snapshots found</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)] max-w-sm">
            Searches run in Unified Search, Video Discovery, or Channel Explorer will appear here automatically.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 text-xs font-black text-white"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Go to Search Workspace</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSnapshots.map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[var(--primary)]" />
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                  {groupName} ({groupItems.length})
                </h2>
                <div className="flex-1 border-t border-[var(--border)]" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupItems.map((snap) => {
                  return (
                    <article
                      key={snap.id}
                      className="group flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs transition hover:border-[var(--primary)]/70 hover:-translate-y-0.5"
                    >
                      <div className="space-y-3">
                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-black uppercase text-[var(--primary)]">
                            {snap.apiVersion.toUpperCase()} · {snap.route}
                          </span>
                          <span
                            className="text-[10px] font-bold text-[var(--muted-foreground)]"
                            title={new Date(snap.expiresAt).toLocaleString()}
                          >
                            {formatExpiryTime(snap.expiresAt)}
                          </span>
                        </div>

                        {/* Query Title */}
                        <div>
                          <p className="line-clamp-2 text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition">
                            {snap.query || "(Empty / Filter Search)"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                            {new Date(snap.capturedAt).toLocaleString()} · {snap.totalResults} result(s)
                          </p>
                        </div>

                        {/* Preview Thumbnails Strip (string URLs only) */}
                        {snap.previewThumbnails && snap.previewThumbnails.length > 0 && (
                          <div className="flex items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--surface-container-high)] p-1">
                            {snap.previewThumbnails.map((thumbUrl, idx) => (
                              <div
                                key={idx}
                                className="relative aspect-video flex-1 overflow-hidden rounded bg-black/40"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={thumbUrl}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
                        <Link
                          href={`/search?replay=${encodeURIComponent(snap.id)}`}
                          className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md bg-[var(--primary)] px-2.5 text-xs font-bold text-white transition hover:opacity-90"
                          title="Replay results completely offline with ZERO API calls"
                        >
                          <Play className="h-3 w-3" />
                          <span>Replay Results</span>
                        </Link>

                        <button
                          type="button"
                          onClick={() => void handleInspectRaw(snap)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                          title="Inspect raw JSON responses recorded for this search"
                        >
                          <Code2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleCopyQuery(snap.query, snap.id)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                          title="Copy search query"
                        >
                          {copiedId === snap.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(snap.id)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-red-500 hover:bg-red-500/10 cursor-pointer"
                          title="Delete snapshot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw JSON Inspector Drawer */}
      {rawTarget && (
        <RawJsonDrawer
          open={Boolean(rawTarget)}
          title={rawTarget.title}
          subtitle="Full Untouched API Response Snapshot (Offline Persistence)"
          payload={rawTarget.payload}
          onClose={() => setRawTarget(null)}
        />
      )}
    </div>
  );
}
