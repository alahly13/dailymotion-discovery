"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  AlertCircle,
  ArrowDownUp,
  Cloud,
  CloudCheck,
  CloudUpload,
  Database,
  Download,
  Filter,
  HardDrive,
  Layers,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type {
  SavedTitleEntry,
  SavedTitlesManifest,
  SavedTitleSyncReceipt,
  SavedTitleKind,
} from "@/lib/saved-titles/types";
import {
  getAllOwnerSavedTitles,
  getPendingOwnerSavedTitles,
  getCloudSyncedOwnerSavedTitles,
  deleteLocalSavedTitle,
  markCommittedSavedTitles,
  buildLocalSavedTitlesManifest,
  SAVED_TITLES_CHANGED_EVENT,
} from "@/lib/saved-titles/local-storage";
import { getClientOwnerId } from "@/lib/saved-titles/capture-service";
import { SavedTitleCard } from "./saved-title-card";
import { AddSavedTitleModal } from "./add-saved-title-modal";
import { EditSavedTitleModal } from "./edit-saved-title-modal";

export function SavedTitlesWorkspace() {
  const [ownerId, setOwnerId] = useState<string>("local-owner");
  const [isAdmin, setIsAdmin] = useState(false);

  // Data states
  const [localPendingEntries, setLocalPendingEntries] = useState<SavedTitleEntry[]>([]);
  const [cloudEntries, setCloudEntries] = useState<SavedTitleEntry[]>([]);
  const [cloudManifest, setCloudManifest] = useState<SavedTitlesManifest | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [apiVersionFilter, setApiVersionFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "title">("newest");

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SavedTitleEntry | null>(null);

  // 1. Resolve authenticated user identity
  const loadUserAndData = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; authenticated: boolean; ownerId?: string; isAdmin?: boolean };
        if (data.ok && data.authenticated && data.ownerId) {
          setOwnerId(data.ownerId);
          setIsAdmin(Boolean(data.isAdmin));
          await refreshAllData(data.ownerId);
          return;
        }
      }
      const clientOwner = await getClientOwnerId();
      setOwnerId(clientOwner);
      await refreshAllData(clientOwner);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Refresh local records from IndexedDB and cloud records from R2
  const refreshAllData = async (targetOwner: string) => {
    setRefreshing(true);
    try {
      // A. Load local pending records from owner's IndexedDB
      const pending = await getPendingOwnerSavedTitles(targetOwner);
      setLocalPendingEntries(pending);

      // B. Fetch committed cloud manifest from R2
      const res = await fetch("/api/saved-titles/cloud-manifest", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          configured?: boolean;
          manifest?: SavedTitlesManifest;
        };
        if (data.ok && data.manifest) {
          setCloudManifest(data.manifest);
          setCloudEntries(data.manifest.entries || []);
        }
      }
    } catch (err) {
      console.warn("[saved-titles] Refresh notice:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadUserAndData();
  }, [loadUserAndData]);

  // 3. Listen to cross-component or cross-tab capture events
  useEffect(() => {
    const handleChanged = () => {
      if (ownerId) {
        void getPendingOwnerSavedTitles(ownerId).then(setLocalPendingEntries);
      }
    };

    window.addEventListener(SAVED_TITLES_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(SAVED_TITLES_CHANGED_EVENT, handleChanged);
  }, [ownerId]);

  // 4. Safe Two-Phase Upload to Cloud Protocol
  const handleUploadToCloud = async () => {
    if (localPendingEntries.length === 0 || uploading) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadPhase("Phase 1: Preparing canonical manifest & SHA-256...");

    try {
      setUploadPhase("Phase 2: Uploading to Cloudflare R2 private bucket...");

      const res = await fetch("/api/saved-titles/cloud-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingEntries: localPendingEntries,
        }),
      });

      setUploadPhase("Phase 3: Verifying integrity digest & committing revision...");

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        phase?: string;
        receipt?: SavedTitleSyncReceipt;
        committedIds?: string[];
        totalCloudEntries?: number;
        revision?: number;
        generationId?: string;
      };

      if (!res.ok || !data.ok || !data.receipt) {
        setUploadError(
          data.error || "Upload failed during synchronization. All pending items remain safe locally in IndexedDB."
        );
        return;
      }

      setUploadPhase("Phase 4: Updating local storage state...");

      // Mark successfully committed records in owner's local IndexedDB
      if (Array.isArray(data.committedIds)) {
        await markCommittedSavedTitles(ownerId, data.committedIds, data.receipt);
      }

      // Refresh cloud and pending state
      await refreshAllData(ownerId);

      setUploadSuccess(
        `Successfully committed ${data.committedIds?.length || 0} item(s) to Cloudflare R2 (Revision #${data.revision || 1}).`
      );
    } catch {
      setUploadError(
        "Network error during upload. All pending items remain intact in your local storage."
      );
    } finally {
      setUploading(false);
      setUploadPhase(null);
    }
  };

  // 5. Delete handler
  const handleDeleteEntry = async (entry: SavedTitleEntry) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${entry.displayTitle || entry.value}"?`
    );
    if (!confirmed) return;

    await deleteLocalSavedTitle(ownerId, entry.id);

    // If deleting purely local
    setLocalPendingEntries((prev) => prev.filter((e) => e.id !== entry.id));
    // If deleting cloud item, update cloud list locally until next sync
    if (entry.status === "cloud_synced") {
      setCloudEntries((prev) => prev.filter((e) => e.id !== entry.id));
    }
  };

  // 6. Export manifest JSON
  const handleExportManifest = async () => {
    const manifest = await buildLocalSavedTitlesManifest(ownerId);
    // Combine with cloud entries
    const combinedEntriesMap = new Map<string, SavedTitleEntry>();
    for (const c of cloudEntries) combinedEntriesMap.set(c.id, c);
    for (const p of localPendingEntries) combinedEntriesMap.set(p.id, p);

    const exportDoc: SavedTitlesManifest = {
      ...manifest,
      revision: cloudManifest?.revision || 1,
      entries: Array.from(combinedEntriesMap.values()),
    };

    const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailymotion-saved-titles-${ownerId.slice(0, 8)}-rev${exportDoc.revision}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtering & Sorting pipeline
  const filterAndSort = (items: SavedTitleEntry[]): SavedTitleEntry[] => {
    let result = items.slice();

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.displayTitle.toLowerCase().includes(q) ||
          item.value.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter((item) => item.source.workspace === sourceFilter);
    }

    // Kind filter
    if (kindFilter !== "all") {
      result = result.filter((item) => item.kind === kindFilter);
    }

    // API version filter
    if (apiVersionFilter !== "all") {
      if (apiVersionFilter === "null") {
        result = result.filter((item) => !item.source.apiVersion);
      } else {
        result = result.filter((item) => item.source.apiVersion === apiVersionFilter);
      }
    }

    // Sort
    result.sort((a, b) => {
      if (sortOrder === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortOrder === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return a.displayTitle.localeCompare(b.displayTitle);
    });

    return result;
  };

  const filteredCloud = useMemo(() => filterAndSort(cloudEntries), [cloudEntries, searchQuery, sourceFilter, kindFilter, apiVersionFilter, sortOrder]);
  const filteredPending = useMemo(() => filterAndSort(localPendingEntries), [localPendingEntries, searchQuery, sourceFilter, kindFilter, apiVersionFilter, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-black text-purple-600 dark:text-purple-300">
              <Layers className="h-3 w-3" />
              <span>Owner-Scoped Manifest</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <CloudCheck className="h-3 w-3" />
              <span>R2 Private Bucket</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--foreground)] tracking-tight">
            Saved Titles & References
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)] max-w-2xl">
            Personal collection of submitted search terms, Dailymotion URLs, resource IDs, and manual references.
            Persisted locally in IndexedDB first, with verified two-phase upload to Cloudflare R2.
          </p>
        </div>

        {/* Top actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAllData(ownerId)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition disabled:opacity-50 cursor-pointer"
            title="Refresh cloud manifest and local store"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportManifest}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition cursor-pointer"
            title="Export local manifest as JSON"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 text-xs font-bold shadow-md hover:opacity-90 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Saved Title</span>
          </button>
        </div>
      </div>

      {/* Upload Feedback Banners */}
      {uploadError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400 font-medium"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={handleUploadToCloud}
            className="shrink-0 rounded-md bg-red-500 text-white px-2.5 py-1 text-[11px] font-bold hover:bg-red-600 cursor-pointer"
          >
            Retry Upload
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium"
        >
          <div className="flex items-center gap-2">
            <CloudCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{uploadSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadSuccess(null)}
            className="text-[11px] font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Progress Status Banner */}
      {uploading && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-600 dark:text-sky-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-2">
              <RotateCw className="h-4 w-4 animate-spin text-sky-500" />
              <span>{uploadPhase || "Synchronizing with Cloudflare R2..."}</span>
            </span>
            <span className="text-[11px] font-mono">Owner: {ownerId.slice(0, 12)}...</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-sky-500/20 overflow-hidden">
            <div className="h-full bg-sky-500 animate-pulse rounded-full w-3/4" />
          </div>
        </div>
      )}

      {/* Filtering & Search Toolbar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search within titles */}
          <div className="lg:col-span-2 relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, query, URL, or notes..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] pl-9 pr-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            />
          </div>

          {/* Source Filter */}
          <div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filter by source"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            >
              <option value="all">All Sources</option>
              <option value="global-search">Global Search</option>
              <option value="link-explorer">Link Explorer</option>
              <option value="channel-explorer">Channel Explorer</option>
              <option value="admin-manual">Admin / Manual</option>
            </select>
          </div>

          {/* Kind Filter */}
          <div>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              aria-label="Filter by kind"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            >
              <option value="all">All Types</option>
              <option value="search_query">Search Query</option>
              <option value="url">URL</option>
              <option value="resource_id">Resource ID</option>
              <option value="handle">Handle (@)</option>
              <option value="text_reference">Reference</option>
            </select>
          </div>

          {/* API Version & Sort */}
          <div className="flex items-center gap-2">
            <select
              value={apiVersionFilter}
              onChange={(e) => setApiVersionFilter(e.target.value)}
              aria-label="Filter by API version"
              className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            >
              <option value="all">All APIs</option>
              <option value="v1">API V1</option>
              <option value="v2">API V2</option>
              <option value="null">N/A</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest" | "title")}
              aria-label="Sort order"
              className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1: CLOUD SYNCED (Top Section)                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="cloud-synced-heading">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[var(--surface)] p-3.5 rounded-xl border border-emerald-500/30">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <CloudCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="cloud-synced-heading" className="text-sm font-black text-[var(--foreground)] tracking-wide uppercase">
                  Cloud Synced
                </h2>
                <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                  {cloudEntries.length} Stored in R2
                </span>
                {cloudManifest && cloudManifest.revision > 0 && (
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                    Rev #{cloudManifest.revision}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Authoritative private Cloudflare R2 bucket (`dailymotion-discovery-private`).
                {cloudManifest?.updatedAt && (
                  <span className="ml-1">
                    Last upload: {new Date(cloudManifest.updatedAt).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="text-xs text-[var(--muted-foreground)] font-mono">
            Key: dailymotion/persistence/{ownerId.slice(0, 8)}.../saved-titles/
          </div>
        </div>

        {/* Cloud Records Grid */}
        {filteredCloud.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredCloud.map((entry) => (
              <SavedTitleCard
                key={entry.id}
                entry={entry}
                onEdit={(e) => setEditingEntry(e)}
                onDelete={(e) => void handleDeleteEntry(e)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center bg-[var(--surface-container-low)]/50">
            <Cloud className="h-8 w-8 mx-auto text-[var(--muted-foreground)] mb-2 opacity-50" />
            <p className="text-xs font-bold text-[var(--foreground)]">No Cloud-Synced Records Yet</p>
            <p className="text-[11px] text-[var(--muted-foreground)] max-w-sm mx-auto mt-1">
              Items in your local pending queue will be permanently synchronized here once you click &quot;Upload to Cloud&quot;.
            </p>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VISUAL SEPARATOR                                                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="relative py-4 select-none" aria-hidden="true">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-dashed border-amber-500/40" />
        </div>
        <div className="relative flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-[var(--surface)] px-4 py-1 text-xs font-black tracking-widest uppercase text-amber-600 dark:text-amber-400 shadow-sm">
            <HardDrive className="h-3.5 w-3.5" />
            <span>Local Storage · Pending Sync ({localPendingEntries.length})</span>
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 2: LOCAL STORAGE · PENDING SYNC (Bottom Section)            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="local-pending-heading">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--surface)] p-3.5 rounded-xl border border-amber-500/30">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="local-pending-heading" className="text-sm font-black text-[var(--foreground)] tracking-wide uppercase">
                  Local Storage · Pending Sync
                </h2>
                <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
                  {localPendingEntries.length} Items Pending
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Newly submitted searches, explored links, and manual titles waiting for explicit cloud upload.
              </p>
            </div>
          </div>

          {/* Prominent Upload to Cloud Button */}
          <button
            type="button"
            onClick={handleUploadToCloud}
            disabled={localPendingEntries.length === 0 || uploading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-bold px-4 py-2 text-xs shadow-md hover:opacity-90 active:scale-[0.99] disabled:opacity-40 transition cursor-pointer"
          >
            {uploading ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading to R2...</span>
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                <span>
                  Upload {localPendingEntries.length} Item{localPendingEntries.length === 1 ? "" : "s"} to Cloud
                </span>
              </>
            )}
          </button>
        </div>

        {/* Pending Records Grid */}
        {filteredPending.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredPending.map((entry) => (
              <SavedTitleCard
                key={entry.id}
                entry={entry}
                onEdit={(e) => setEditingEntry(e)}
                onDelete={(e) => void handleDeleteEntry(e)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center bg-[var(--surface-container-low)]/50">
            <Sparkles className="h-8 w-8 mx-auto text-[var(--muted-foreground)] mb-2 opacity-50" />
            <p className="text-xs font-bold text-[var(--foreground)]">Pending Queue is Empty</p>
            <p className="text-[11px] text-[var(--muted-foreground)] max-w-sm mx-auto mt-1">
              All records are currently synchronized with Cloudflare R2. Submitting any search or link in the app will automatically add it here.
            </p>
          </div>
        )}
      </section>

      {/* Add Modal */}
      {addModalOpen && (
        <AddSavedTitleModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onCreated={(entry) => {
            setLocalPendingEntries((prev) => [entry, ...prev]);
          }}
        />
      )}

      {/* Edit Modal */}
      {editingEntry && (
        <EditSavedTitleModal
          entry={editingEntry}
          isOpen={Boolean(editingEntry)}
          onClose={() => setEditingEntry(null)}
          onUpdated={(updated) => {
            setLocalPendingEntries((prev) =>
              prev.map((e) => (e.id === updated.id ? updated : e))
            );
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
}
