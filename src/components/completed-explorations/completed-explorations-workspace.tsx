// Completed Explorations Workspace — Permanent Local Archive & In-Memory Cross-Catalog Search (2026)
//
// What this controls: Dedicated UI at `/completed-explorations` for managing, searching,
// viewing, and exporting fully completed channel and playlist explorations saved in local IndexedDB.
// Why it exists: Provides an offline-first, zero-network-call permanent archive of completed crawls,
// completely isolated from Search History and Saved Items, with instant in-memory cross-catalog title search.
// Scope: Completed Explorations (/completed-explorations).

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  ArrowUpDown,
  BookmarkCheck,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Filter,
  FolderArchive,
  FolderCheck,
  Hash,
  Layers,
  ListMusic,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Tv,
  User,
  UsersRound,
  X,
} from "lucide-react";
import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import { getClientOwnerId } from "@/lib/saved-titles/capture-service";
import {
  deleteCompletedExplorationManifest,
  listCompletedExplorationManifests,
  searchCompletedExplorations,
  type CompletedExplorationFilter,
  type CompletedExplorationManifest,
  type MatchedCatalogItem,
} from "@/lib/link-explorer/completed-explorations-service";
import {
  deleteScanCheckpoint,
  listScanCheckpoints,
  type ScanCheckpointRecord,
} from "@/lib/link-explorer/scan-checkpoint-service";
import { ResultCard } from "@/components/discovery/result-card";
import { formatSafeDescription } from "@/lib/utils/format-description";
import { cn } from "@/lib/utils/cn";

export function CompletedExplorationsWorkspace() {
  const [activeTab, setActiveTab] = useState<"completed" | "in_progress">("completed");
  const [manifests, setManifests] = useState<CompletedExplorationManifest[]>([]);
  const [checkpoints, setCheckpoints] = useState<ScanCheckpointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string>("local-owner");

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApiVersion, setSelectedApiVersion] = useState<"all" | "v1" | "v2">("all");
  const [selectedKind, setSelectedKind] = useState<"all" | "channel" | "playlist">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "title" | "items_desc">("date_desc");

  // Active opened catalog modal/drawer
  const [activeCatalog, setActiveCatalog] = useState<CompletedExplorationManifest | null>(null);
  const [catalogTitleFilter, setCatalogTitleFilter] = useState("");

  // Raw JSON modal
  const [jsonModalManifest, setJsonModalManifest] = useState<CompletedExplorationManifest | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Deletion feedback
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Load manifests and checkpoints on mount
  const refreshData = async () => {
    setLoading(true);
    try {
      const currentOwner = await getClientOwnerId();
      setOwnerId(currentOwner);

      const [loadedManifests, loadedCheckpoints] = await Promise.all([
        listCompletedExplorationManifests(currentOwner, {
          apiVersion: selectedApiVersion,
          resourceKind: selectedKind === "all" ? undefined : selectedKind,
          sortBy,
        }),
        listScanCheckpoints(currentOwner),
      ]);

      setManifests(loadedManifests);
      setCheckpoints(loadedCheckpoints);
    } catch (err) {
      console.error("Failed to load completed explorations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApiVersion, selectedKind, sortBy]);

  // Total statistics across all completed manifests
  const totalStats = useMemo(() => {
    let totalItems = 0;
    let v1Count = 0;
    let v2Count = 0;
    for (const m of manifests) {
      totalItems += m.totalUniqueItems || m.items?.length || 0;
      if (m.apiVersion === "v1") v1Count++;
      else if (m.apiVersion === "v2") v2Count++;
    }
    return {
      totalCatalogs: manifests.length,
      totalItems,
      v1Count,
      v2Count,
    };
  }, [manifests]);

  // Real-time zero-network in-memory search across all manifests
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        isSearching: false,
        matchedItems: [] as MatchedCatalogItem[],
        filteredManifests: manifests,
      };
    }

    const matchedItems: MatchedCatalogItem[] = [];
    const matchingManifestIds = new Set<string>();

    for (const manifest of manifests) {
      const titleMatches = (manifest.resourceTitle || "").toLowerCase().includes(q);
      const idMatches = (manifest.resourceId || "").toLowerCase().includes(q);
      const descMatches = (manifest.resourceDescription || "").toLowerCase().includes(q);

      if (titleMatches || idMatches || descMatches) {
        matchingManifestIds.add(manifest.id);
      }

      for (const item of manifest.items || []) {
        const itemTitleMatch = (item.title || "").toLowerCase().includes(q);
        const itemDescMatch = (item.description || "").toLowerCase().includes(q);
        const itemIdMatch = (item.id || "").toLowerCase().includes(q);
        const itemOwnerMatch = (item.ownerName || item.ownerId || "").toLowerCase().includes(q);

        if (itemTitleMatch || itemDescMatch || itemIdMatch || itemOwnerMatch) {
          matchingManifestIds.add(manifest.id);
          matchedItems.push({
            manifestId: manifest.id,
            resourceTitle: manifest.resourceTitle,
            resourceKind: manifest.resourceKind,
            apiVersion: manifest.apiVersion,
            item,
          });
        }
      }
    }

    const filtered = manifests.filter((m) => matchingManifestIds.has(m.id));

    return {
      isSearching: true,
      matchedItems,
      filteredManifests: filtered,
    };
  }, [manifests, searchQuery]);

  // Export manifest as downloadable JSON
  const handleExportJson = (manifest: CompletedExplorationManifest) => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `completed-${manifest.resourceKind}-${manifest.resourceId}-${manifest.apiVersion}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy raw JSON to clipboard
  const handleCopyRawJson = (manifest: CompletedExplorationManifest) => {
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2)).catch(() => {});
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Delete completed exploration
  const handleDeleteManifest = async (id: string) => {
    try {
      await deleteCompletedExplorationManifest(id);
      setManifests((prev) => prev.filter((m) => m.id !== id));
      setDeleteTargetId(null);
      setActionNotice("Exploration archive deleted from local storage.");
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      console.error("Failed to delete manifest:", err);
    }
  };

  // Delete in-progress checkpoint
  const handleDeleteCheckpoint = async (chk: ScanCheckpointRecord) => {
    try {
      await deleteScanCheckpoint(ownerId, chk.apiVersion, chk.resourceType, chk.resourceId);
      setCheckpoints((prev) => prev.filter((c) => c.id !== chk.id));
      setActionNotice("Scan checkpoint removed.");
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      console.error("Failed to delete checkpoint:", err);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <FolderCheck className="h-4 w-4" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Completed Explorations
            </h1>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400">
              Zero-API-Calls Archive
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-2xl">
            Permanent local repository of fully completed channel and playlist explorations. Browse, search, and reopen verified catalogs stored safely in IndexedDB without repeating Dailymotion network queries.
          </p>
        </div>

        {/* Global Summary Badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-xl border border-border/70 bg-card/70 px-3.5 py-2">
            <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">
              Saved Catalogs
            </span>
            <span className="text-base font-black text-foreground">
              {totalStats.totalCatalogs}
            </span>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 px-3.5 py-2">
            <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">
              Archived Videos
            </span>
            <span className="text-base font-black text-primary">
              {totalStats.totalItems.toLocaleString()}
            </span>
          </div>
          <Link
            href="/link-explorer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-90 shadow-xs"
          >
            <Compass className="h-3.5 w-3.5" />
            New Exploration
          </Link>
        </div>
      </div>

      {/* ACTION TOAST NOTICE */}
      {actionNotice && (
        <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:opacity-80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* TOP IN-MEMORY SEARCH & FILTER BAR (ZERO NETWORK CALLS) */}
      <div className="rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved exploration results (video titles, descriptions, channel names, tags)..."
              className="w-full h-11 rounded-xl border border-border/80 bg-background/90 pl-10 pr-10 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear Search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Guarantee Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-black uppercase text-amber-600 dark:text-amber-400 shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
            LOCAL ARCHIVE SEARCH · ZERO API CALLS
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/50 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-bold text-[11px] uppercase flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filters:
            </span>

            {/* API Version Filter */}
            <div className="inline-flex rounded-lg border border-border/70 p-0.5 bg-background">
              {(["all", "v1", "v2"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSelectedApiVersion(v)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer",
                    selectedApiVersion === v
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v === "all" ? "All APIs" : v.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Resource Kind Filter */}
            <div className="inline-flex rounded-lg border border-border/70 p-0.5 bg-background">
              {(["all", "channel", "playlist"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedKind(k)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer",
                    selectedKind === k
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {k === "all" ? "All Kinds" : k === "channel" ? "Channels" : "Playlists"}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-bold text-[11px] uppercase flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-lg border border-border/70 bg-background px-2.5 text-[11px] font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="date_desc">Newest Completed</option>
              <option value="date_asc">Oldest Completed</option>
              <option value="items_desc">Most Videos</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Readout of Search Matches */}
        {searchResults.isSearching && (
          <div className="rounded-lg bg-secondary/60 px-3 py-1.5 text-xs text-foreground flex items-center justify-between">
            <span>
              Showing <strong>{searchResults.matchedItems.length}</strong> matching records across{" "}
              <strong>{searchResults.filteredManifests.length}</strong> saved catalog(s)
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Reset Search
            </button>
          </div>
        )}
      </div>

      {/* SEGMENTED TABS: COMPLETED VS IN-PROGRESS */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("completed")}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer",
            activeTab === "completed"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderCheck className="h-4 w-4" />
          Completed Explorations ({manifests.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("in_progress")}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer",
            activeTab === "in_progress"
              ? "border-amber-500 text-amber-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Clock className="h-4 w-4" />
          In-Progress Scans ({checkpoints.length})
        </button>
      </div>

      {/* TAB 1: COMPLETED EXPLORATIONS */}
      {activeTab === "completed" && (
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-border/70 bg-card/60 p-12 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm font-bold text-foreground">Loading completed exploration manifests from IndexedDB...</p>
            </div>
          ) : manifests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center space-y-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-secondary text-muted-foreground mx-auto">
                <FolderArchive className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-foreground">No Completed Explorations Saved Yet</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  When you explore a channel or playlist in Link Explorer and finish retrieving its catalog, save it as a completed manifest to store it permanently in browser database storage.
                </p>
              </div>
              <Link
                href="/link-explorer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-90 shadow-xs"
              >
                <Compass className="h-3.5 w-3.5" />
                Go to Link Explorer
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.filteredManifests.map((manifest) => {
                const uniqueCount = manifest.totalUniqueItems || manifest.items?.length || 0;
                const lifetime = manifest.providerReportedLifetimeTotal;
                const hasFullLifetime = lifetime ? uniqueCount >= lifetime : true;

                return (
                  <article
                    key={manifest.id}
                    className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs hover:border-primary/60 transition-all duration-200 group"
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                            {manifest.resourceKind}
                          </span>
                          <span className="rounded-md bg-secondary border border-border/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {manifest.apiVersion.toUpperCase()}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                            hasFullLifetime
                              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400"
                          )}
                        >
                          {hasFullLifetime ? "100% Scope" : "Partial Scope"}
                        </span>
                      </div>

                      {/* Title & Resource ID */}
                      <div>
                        <h3 className="text-base font-black text-foreground group-hover:text-primary transition line-clamp-1">
                          {manifest.resourceTitle || manifest.resourceId}
                        </h3>
                        <p className="text-xs font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span>{manifest.resourceId}</span>
                          {manifest.canonicalSourceUrl && (
                            <a
                              href={manifest.canonicalSourceUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-primary hover:underline inline-flex items-center"
                              title="Open on Dailymotion"
                            >
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          )}
                        </p>
                      </div>

                      {/* Bio Preview */}
                      {manifest.resourceDescription && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {formatSafeDescription(manifest.resourceDescription)}
                        </p>
                      )}

                      {/* Statistics Matrix */}
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/50 p-3 text-xs">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            Archived Items
                          </span>
                          <span className="text-sm font-black text-foreground">
                            {uniqueCount.toLocaleString()}
                          </span>
                          {lifetime && (
                            <span className="text-[10px] text-muted-foreground block">
                              of {lifetime.toLocaleString()} reported
                            </span>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            Date Span
                          </span>
                          <span className="text-[11px] font-bold text-foreground block truncate">
                            {manifest.oldestItemDate
                              ? `${manifest.oldestItemDate.substring(0, 7)} → ${
                                  manifest.newestItemDate ? manifest.newestItemDate.substring(0, 7) : "Now"
                                }`
                              : "Undated"}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            Strategy: {manifest.scanStrategy}
                          </span>
                        </div>
                      </div>

                      {/* Timestamp & SHA-256 */}
                      <div className="text-[10px] text-muted-foreground/80 flex items-center justify-between pt-1 font-mono">
                        <span>Completed: {new Date(manifest.completedAt).toLocaleDateString()}</span>
                        <span title={manifest.sha256Checksum}>
                          SHA: {manifest.sha256Checksum?.substring(0, 8)}...
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-4 border-t border-border/50 mt-4">
                      <button
                        type="button"
                        onClick={() => setActiveCatalog(manifest)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 cursor-pointer shadow-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Open Catalog
                      </button>

                      <button
                        type="button"
                        onClick={() => setJsonModalManifest(manifest)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border/70 bg-secondary/70 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                        title="View Raw Manifest JSON"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        JSON
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportJson(manifest)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border/70 bg-secondary/70 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Export JSON file"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(manifest.id)}
                        className="ml-auto inline-flex min-h-8 items-center justify-center rounded-lg border border-border/70 p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition cursor-pointer"
                        title="Delete from local archive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: IN-PROGRESS SCANS */}
      {activeTab === "in_progress" && (
        <div className="space-y-4">
          {checkpoints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center space-y-3">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-secondary text-muted-foreground mx-auto">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-foreground">No In-Progress Scans</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Any scan that is interrupted, partially retrieved, or waiting for date-window continuation is preserved here automatically so you can resume anytime.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checkpoints.map((chk) => {
                const ratio =
                  chk.lifetimeTotal && chk.lifetimeTotal > 0
                    ? Math.min(100, Math.round((chk.itemsRetrieved / chk.lifetimeTotal) * 1000) / 10)
                    : null;

                return (
                  <article
                    key={chk.id}
                    className="flex flex-col justify-between rounded-2xl border border-amber-500/30 bg-card/90 p-5 shadow-xs space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                            {chk.resourceType}
                          </span>
                          <span className="rounded-md bg-secondary border border-border/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {chk.apiVersion.toUpperCase()}
                          </span>
                        </div>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          {chk.status}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-black text-foreground">{chk.resourceId}</h3>
                        <p className="text-xs text-muted-foreground">
                          Retrieved: <strong>{chk.itemsRetrieved.toLocaleString()}</strong>
                          {chk.lifetimeTotal && ` / ${chk.lifetimeTotal.toLocaleString()} references`}
                          {ratio !== null && ` (${ratio}%)`}
                        </p>
                      </div>

                      {/* Progress Bar */}
                      {ratio !== null && (
                        <div className="w-full bg-secondary/70 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(3, ratio))}%` }}
                          />
                        </div>
                      )}

                      <div className="text-[10px] text-muted-foreground flex items-center justify-between font-mono">
                        <span>Pages: {chk.completedPages}</span>
                        <span>Updated: {new Date(chk.updatedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <Link
                        href={`/link-explorer?url=${encodeURIComponent(chk.canonicalUrl || chk.resourceId)}&v=${chk.apiVersion}&resume=true`}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-xs font-black text-black hover:opacity-90 shadow-xs"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        Resume in Link Explorer
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleDeleteCheckpoint(chk)}
                        className="inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Discard
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: FULL LOCAL CATALOG VIEWER (ZERO NETWORK CALLS) */}
      {activeCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative flex flex-col w-full max-w-6xl max-h-[90vh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border p-4 bg-card">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                    {activeCatalog.resourceKind} · {activeCatalog.apiVersion.toUpperCase()}
                  </span>
                  <h2 className="text-lg font-black text-foreground">
                    {activeCatalog.resourceTitle || activeCatalog.resourceId}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  Local Archive · {activeCatalog.totalUniqueItems || activeCatalog.items.length} records · ZERO API CALLS
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportJson(activeCatalog)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-secondary cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCatalog(null);
                    setCatalogTitleFilter("");
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* In-Modal Title Search */}
            <div className="p-3 border-b border-border/60 bg-secondary/30 flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
              <input
                type="text"
                value={catalogTitleFilter}
                onChange={(e) => setCatalogTitleFilter(e.target.value)}
                placeholder="Filter titles within this archived catalog..."
                className="w-full h-8 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {catalogTitleFilter && (
                <button
                  type="button"
                  onClick={() => setCatalogTitleFilter("")}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Catalog Items Grid */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(() => {
                const q = catalogTitleFilter.trim().toLowerCase();
                const filtered = (activeCatalog.items || []).filter((it) =>
                  !q || (it.title || "").toLowerCase().includes(q)
                );

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center text-xs text-muted-foreground">
                      No videos match the title query &quot;{catalogTitleFilter}&quot;.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map((item) => (
                      <ResultCard key={item.id} item={item} />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: RAW JSON MANIFEST VIEWER */}
      {jsonModalManifest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative flex flex-col w-full max-w-4xl max-h-[85vh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4 bg-card">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-black text-foreground">
                  Manifest JSON: {jsonModalManifest.resourceId} ({jsonModalManifest.apiVersion.toUpperCase()})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyRawJson(jsonModalManifest)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-secondary cursor-pointer"
                >
                  {copiedJson ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedJson ? "Copied!" : "Copy JSON"}
                </button>
                <button
                  type="button"
                  onClick={() => setJsonModalManifest(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-black/90 font-mono text-xs text-emerald-400">
              <pre className="whitespace-pre-wrap">{JSON.stringify(jsonModalManifest, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: DELETE ARCHIVE */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-destructive/50 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <h3 className="text-base font-black text-foreground">Confirm Deletion</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this completed exploration archive? This will permanently remove its consolidated manifest and cached catalog records from local IndexedDB. Saved Items and Playlists will NOT be affected.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-xs font-bold rounded-lg border border-border hover:bg-secondary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteManifest(deleteTargetId)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
