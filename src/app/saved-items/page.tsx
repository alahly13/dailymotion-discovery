"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookmarkCheck,
  Cloud,
  Download,
  Filter,
  Grid3X3,
  List,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Tv,
  Compass,
  Star,
  ExternalLink,
  Copy,
  Check,
  Code2,
  FolderPlus,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import type { LocalSavedItemRecord } from "@/lib/local-first/indexeddb-store";
import { CountrySelector } from "@/components/discovery/country-selector";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";
import { canonicalDailymotionUrl, toDiscoveryKind } from "@/lib/resources/dailymotion-resource-taxonomy";

type TabFilter = "all" | "videos" | "channels";
type SortOption = "newest" | "oldest" | "title_asc" | "title_desc" | "views_desc" | "duration_desc";
type ViewMode = "grid" | "list";

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

function safeFormatDate(isoOrMs?: string | number | null): string {
  if (!isoOrMs) return "Recently";
  try {
    const d = new Date(isoOrMs);
    if (isNaN(d.getTime())) return "Recently";
    return dateFormatter.format(d);
  } catch {
    return "Recently";
  }
}

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function SavedItemsPage() {
  const {
    ready,
    savedItems,
    collections,
    coordinator,
    syncing,
    hydrating,
    saveAll,
    hydrateCloud,
    pendingCount,
    lastReceipt,
  } = useMergedDataset();

  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Selection state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [targetCollectionId, setTargetCollectionId] = useState("");
  const [batchActionNotice, setBatchActionNotice] = useState<string | null>(null);
  const [inspectedItem, setInspectedItem] = useState<LocalSavedItemRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Extract unique categories from saved items for filtering
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of savedItems) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [savedItems]);

  // Tab counts
  const videoCount = useMemo(
    () => savedItems.filter((i) => i.resourceType === "VIDEO" || i.resourceType === "LIVESTREAM").length,
    [savedItems]
  );
  const channelCount = useMemo(
    () => savedItems.filter((i) => i.resourceType === "CHANNEL" || i.resourceType === "USER" || i.resourceType === "PROFILE").length,
    [savedItems]
  );

  // Filter & sort pipeline with defensive guards against corrupted or legacy records
  const filteredItems = useMemo(() => {
    return (savedItems || [])
      .filter((item) => {
        if (!item || (!item.id && !item.compositeKey)) return false;

        // Tab filter
        if (activeTab === "videos" && item.resourceType !== "VIDEO" && item.resourceType !== "LIVESTREAM") return false;
        if (activeTab === "channels" && item.resourceType !== "CHANNEL" && item.resourceType !== "USER" && item.resourceType !== "PROFILE") return false;

        // Country filter
        if (selectedCountry) {
          const itemCountry = item.country || item.snapshot?.country;
          if (!itemCountry || itemCountry.toUpperCase() !== selectedCountry.toUpperCase()) return false;
        }

        // Category filter
        if (selectedCategory && item.category !== selectedCategory) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const title = (item.title || "").toLowerCase();
          const desc = (item.description || "").toLowerCase();
          const owner = (item.ownerName || "").toLowerCase();
          const id = (item.id || "").toLowerCase();
          const stableId = (item.stableId || "").toLowerCase();
          const tags = (item.tags || []).join(" ").toLowerCase();

          return (
            title.includes(q) ||
            desc.includes(q) ||
            owner.includes(q) ||
            id.includes(q) ||
            stableId.includes(q) ||
            tags.includes(q)
          );
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "newest": {
            const timeB = b.savedAt ? new Date(b.savedAt).getTime() : 0;
            const timeA = a.savedAt ? new Date(a.savedAt).getTime() : 0;
            return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
          }
          case "oldest": {
            const timeB = b.savedAt ? new Date(b.savedAt).getTime() : 0;
            const timeA = a.savedAt ? new Date(a.savedAt).getTime() : 0;
            return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
          }
          case "title_asc":
            return (a.title || "").localeCompare(b.title || "");
          case "title_desc":
            return (b.title || "").localeCompare(a.title || "");
          case "views_desc":
            return (b.viewsTotal ?? 0) - (a.viewsTotal ?? 0);
          case "duration_desc":
            return (b.duration ?? 0) - (a.duration ?? 0);
          default:
            return 0;
        }
      });
  }, [savedItems, activeTab, selectedCountry, selectedCategory, searchQuery, sortBy]);

  // Bulk selection helpers
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedKeys.has(i.compositeKey));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedKeys(new Set());
    } else {
      const next = new Set(selectedKeys);
      for (const item of filteredItems) {
        next.add(item.compositeKey);
      }
      setSelectedKeys(next);
    }
  };

  const toggleSelectItem = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    const count = selectedKeys.size;
    if (!window.confirm(`Are you sure you want to remove ${count} saved item(s) from your local library?`)) {
      return;
    }
    await coordinator.removeItemsBatch(Array.from(selectedKeys));
    setSelectedKeys(new Set());
    setBatchActionNotice(`Removed ${count} item(s) from Saved Items.`);
    setTimeout(() => setBatchActionNotice(null), 3000);
  };

  const handleBulkAssignCollection = async () => {
    if (selectedKeys.size === 0 || !targetCollectionId) return;
    let added = 0;
    for (const key of selectedKeys) {
      const item = savedItems.find((i) => i.compositeKey === key);
      if (item?.snapshot) {
        await coordinator.addItemToCollection(targetCollectionId, item.snapshot);
        added += 1;
      }
    }
    const colName = collections.find((c) => c.id === targetCollectionId)?.name ?? "Collection";
    setBatchActionNotice(`Assigned ${added} item(s) to "${colName}".`);
    setTargetCollectionId("");
    setTimeout(() => setBatchActionNotice(null), 3000);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      /* blocked */
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header with Title and Sync Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
              <BookmarkCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Saved Items</h1>
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                Local-first research library · Durably stored in IndexedDB · Two-phase R2 synchronization
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={syncing}
            onClick={() => void saveAll()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-black uppercase text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
            {syncing ? "Syncing..." : pendingCount > 0 ? `Save All to Cloud (${pendingCount})` : "Save All to Cloud"}
          </button>

          <button
            type="button"
            disabled={hydrating}
            onClick={() => void hydrateCloud()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold transition hover:bg-[var(--surface-container-high)] disabled:opacity-50"
            title="Pull and verify latest snapshot from Cloudflare R2"
          >
            {hydrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Pull Cloud
          </button>

          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-md p-1.5 transition ${viewMode === "grid" ? "bg-primary text-primary-foreground shadow-xs font-bold" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              aria-label="Grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-md p-1.5 transition ${viewMode === "list" ? "bg-primary text-primary-foreground shadow-xs font-bold" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sync Status / Notice Banner */}
      {lastReceipt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs">
          <span className="font-semibold text-emerald-800 dark:text-emerald-300">
            Last Cloud Sync: <strong>{lastReceipt.stage}</strong> · Generation: <code>{Object.values(lastReceipt.generationIds).join(", ") || lastReceipt.batchId}</code>
          </span>
          <span className="text-[var(--muted-foreground)]">
            {new Date(lastReceipt.completedAt || lastReceipt.startedAt).toLocaleTimeString()}
          </span>
        </div>
      )}

      {batchActionNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-4 py-2.5 text-xs font-bold text-[var(--primary)]">
          <Check className="h-4 w-4 shrink-0" />
          <span>{batchActionNotice}</span>
        </div>
      )}

      {/* Filter and Tab Navigation Bar */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        {/* Tabs: All / Videos / Channels */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex rounded-lg bg-[var(--surface-container-low)] p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-md px-3 py-1.5 transition ${activeTab === "all" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              All Items ({savedItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("videos")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${activeTab === "videos" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              <Tv className="h-3.5 w-3.5" />
              Videos ({videoCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("channels")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${activeTab === "channels" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              <Compass className="h-3.5 w-3.5" />
              Channels ({channelCount})
            </button>
          </div>

          <div className="text-xs font-bold text-[var(--muted-foreground)]">
            Showing <span className="text-[var(--foreground)]">{filteredItems.length}</span> of {savedItems.length} items
          </div>
        </div>

        {/* Filter Controls: Search, Country, Category, Sort */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved items..."
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] pl-9 pr-3 text-xs font-medium focus:border-[var(--primary)] focus:outline-none"
            />
          </div>

          <div>
            <CountrySelector
              value={selectedCountry}
              onChange={setSelectedCountry}
              mode="local"
              label=""
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-medium focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="">All Categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-medium focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="newest">Saved: Newest First</option>
              <option value="oldest">Saved: Oldest First</option>
              <option value="title_asc">Title: A to Z</option>
              <option value="title_desc">Title: Z to A</option>
              <option value="views_desc">Most Views</option>
              <option value="duration_desc">Longest Duration</option>
            </select>
          </div>
        </div>

        {/* Active Filters Clear Shortcut */}
        {(searchQuery || selectedCountry || selectedCategory) && (
          <div className="flex items-center gap-2 pt-1 text-xs text-[var(--muted-foreground)]">
            <span>Active filters:</span>
            {searchQuery && <span className="rounded bg-[var(--surface-container-high)] px-2 py-0.5 font-bold">Query: {searchQuery}</span>}
            {selectedCountry && <span className="rounded bg-[var(--surface-container-high)] px-2 py-0.5 font-bold">Country: {selectedCountry}</span>}
            {selectedCategory && <span className="rounded bg-[var(--surface-container-high)] px-2 py-0.5 font-bold">Category: {selectedCategory}</span>}
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCountry("");
                setSelectedCategory("");
              }}
              className="font-bold text-[var(--primary)] hover:underline"
            >
              Reset all
            </button>
          </div>
        )}
      </div>

      {/* Bulk Selection Actions Bar */}
      {filteredItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded accent-[var(--primary)]"
            />
            <span>Select All Visible ({filteredItems.length})</span>
          </label>

          {selectedKeys.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-[var(--primary)]">
                {selectedKeys.size} item(s) selected
              </span>

              {collections.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={targetCollectionId}
                    onChange={(e) => setTargetCollectionId(e.target.value)}
                    className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs"
                  >
                    <option value="">Assign to Collection...</option>
                    {collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!targetCollectionId}
                    onClick={() => void handleBulkAssignCollection()}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-bold text-primary-foreground shadow-xs disabled:opacity-50"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Assign
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 text-xs font-bold text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove Selected
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {!ready && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)]" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {ready && savedItems.length === 0 && (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-container-high)] text-[var(--muted-foreground)]">
            <BookmarkCheck className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-black">Your Saved Library is Empty</h2>
          <p className="mt-1.5 max-w-md text-xs leading-5 text-[var(--muted-foreground)]">
            Save Dailymotion videos, channels, and playlists directly from any discovery search page by clicking the Save icon on result cards.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/global-search?type=video"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black uppercase text-primary-foreground shadow-xs transition hover:opacity-90"
            >
              <Tv className="h-3.5 w-3.5" />
              Discover Videos
            </Link>
            <Link
              href="/channel-explorer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold transition hover:bg-[var(--surface-container-high)]"
            >
              <Compass className="h-3.5 w-3.5" />
              Explore Channels
            </Link>
            <Link
              href="/search"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold transition hover:bg-[var(--surface-container-high)]"
            >
              <Search className="h-3.5 w-3.5" />
              Unified Search
            </Link>
          </div>
        </div>
      )}

      {/* No Search Matches */}
      {ready && savedItems.length > 0 && filteredItems.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-xs text-[var(--muted-foreground)]">
          <p className="font-bold">No saved items match your filter criteria.</p>
          <p className="mt-1">Try resetting the country, category, or search query filter.</p>
        </div>
      )}

      {/* Results Rendering: Grid View */}
      {ready && viewMode === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const isSelected = selectedKeys.has(item.compositeKey);
            const openUrl = canonicalDailymotionUrl(toDiscoveryKind(item.resourceType), item.id, item.url);
            const durationLabel = formatDuration(item.duration);
            const stableId = item.stableId || `dailymotion:${item.resourceType}:${item.id}`;

            return (
              <article
                key={item.compositeKey}
                className={`group flex flex-col overflow-hidden rounded-xl border bg-[var(--card)] transition ${
                  isSelected ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/20" : "border-[var(--border)] hover:border-[var(--primary)]/60"
                }`}
              >
                {/* Media Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-container-high)]">
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)]">
                      {item.resourceType === "CHANNEL" || item.resourceType === "USER" || item.resourceType === "PROFILE" ? (
                        <Compass className="h-8 w-8" />
                      ) : (
                        <Tv className="h-8 w-8" />
                      )}
                    </div>
                  )}

                  {durationLabel && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-black text-white">
                      {durationLabel}
                    </span>
                  )}

                  {/* Selection Checkbox */}
                  <label className="absolute left-2.5 top-2.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/60 transition hover:bg-black/90">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(item.compositeKey)}
                      className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                    />
                  </label>

                  {/* Favorite Toggle */}
                  <button
                    type="button"
                    onClick={() => void coordinator.setSavedItemFavorite(item.compositeKey, !item.isFavorite)}
                    className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/90"
                    title={item.isFavorite ? "Remove favorite" : "Mark favorite"}
                  >
                    <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                </div>

                {/* Content Body */}
                <div className="flex flex-1 flex-col p-4">
                  {/* Badges: Resource, Stable ID, Sync Status */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase">
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        item.resourceType === "CHANNEL" || item.resourceType === "USER" || item.resourceType === "PROFILE"
                          ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                      }`}
                    >
                      {item.resourceType}
                    </span>

                    <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">
                      {item.apiVersion}
                    </span>

                    {/* Sync Status Badge */}
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        item.syncStatus === "cloud_verified"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {item.syncStatus === "cloud_verified" ? "Cloud verified" : "Local only"}
                    </span>

                    {item.country && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                        {item.country}
                      </span>
                    )}
                  </div>

                  {/* Stable Item ID with Copy Helper */}
                  <div className="mt-1 flex items-center justify-between gap-1 text-[11px] font-mono text-[var(--muted-foreground)]">
                    <span className="truncate" title={stableId}>
                      {stableId}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(stableId, item.compositeKey)}
                      className="shrink-0 p-1 hover:text-[var(--foreground)]"
                      title="Copy stable ID"
                    >
                      {copiedKey === item.compositeKey ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {/* Title & Permalinks */}
                  <h3 className="mt-2 line-clamp-2 text-sm font-black leading-snug">
                    {openUrl ? (
                      <a href={openUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>

                  {item.ownerName && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      By {item.ownerName}
                    </p>
                  )}

                  {item.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                      {item.description}
                    </p>
                  )}

                  {/* Stats & Meta */}
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-[var(--muted-foreground)]">
                    {item.viewsTotal !== undefined && item.viewsTotal !== null && (
                      <span>{compactNumber.format(item.viewsTotal)} views</span>
                    )}
                    <span>Saved {safeFormatDate(item.savedAt)}</span>
                  </div>

                  {/* Action Controls */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
                    <div className="flex items-center gap-1">
                      {openUrl && (
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs font-bold transition hover:bg-[var(--surface-container-high)]"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setInspectedItem(item)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs font-bold transition hover:bg-[var(--surface-container-high)]"
                        title="Inspect raw metadata"
                      >
                        <Code2 className="h-3 w-3" />
                        JSON
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void coordinator.removeItem(item.compositeKey)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/30 px-2 text-xs font-bold text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Results Rendering: Dedicated Data Table View with explicit Title column */}
      {ready && viewMode === "list" && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xs">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-container-low)] text-[11px] font-black uppercase text-[var(--muted-foreground)]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                    title="Select all visible"
                  />
                </th>
                <th className="min-w-[280px] px-3 py-3">
                  <div className="flex items-center gap-1.5 text-[var(--foreground)]">
                    <Tv className="h-3.5 w-3.5 text-[var(--primary)]" />
                    <span>Title</span>
                  </div>
                </th>
                <th className="w-24 px-3 py-3">Resource</th>
                <th className="w-36 px-3 py-3">ID</th>
                <th className="w-32 px-3 py-3">Owner / Channel</th>
                <th className="w-28 px-3 py-3">Status</th>
                <th className="w-28 px-3 py-3">Saved Date</th>
                <th className="w-28 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredItems.map((item) => {
                const isSelected = selectedKeys.has(item.compositeKey);
                const openUrl = canonicalDailymotionUrl(toDiscoveryKind(item.resourceType), item.id, item.url);
                const stableId = item.stableId || `dailymotion:${item.resourceType}:${item.id}`;

                return (
                  <tr
                    key={item.compositeKey}
                    className={`transition hover:bg-[var(--surface-container-low)] ${
                      isSelected ? "bg-[var(--primary)]/5" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.compositeKey)}
                        className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-[var(--surface-container-high)]">
                          {item.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)]">
                              <Tv className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 font-black text-sm text-[var(--foreground)]" title={item.title}>
                            {openUrl ? (
                              <a href={openUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">
                                {item.title}
                              </a>
                            ) : (
                              item.title
                            )}
                          </p>
                          {item.description && (
                            <p className="line-clamp-1 text-[11px] text-[var(--muted-foreground)]">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                          item.resourceType === "CHANNEL" || item.resourceType === "USER" || item.resourceType === "PROFILE"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                        }`}
                      >
                        {item.resourceType}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                      <div className="flex items-center gap-1">
                        <span className="truncate max-w-[100px]" title={item.id}>
                          {item.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(stableId, item.compositeKey)}
                          className="shrink-0 p-1 hover:text-[var(--foreground)]"
                          title="Copy stable ID"
                        >
                          {copiedKey === item.compositeKey ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      <span className="truncate block max-w-[110px]" title={item.ownerName || ""}>
                        {item.ownerName || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          item.syncStatus === "cloud_verified"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {item.syncStatus === "cloud_verified" ? "Cloud verified" : "Local only"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
                      {safeFormatDate(item.savedAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => void coordinator.setSavedItemFavorite(item.compositeKey, !item.isFavorite)}
                          className="rounded p-1 text-[var(--muted-foreground)] hover:text-amber-400"
                          title={item.isFavorite ? "Remove favorite" : "Mark favorite"}
                        >
                          <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
                        </button>
                        {openUrl && (
                          <a
                            href={openUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Open in Dailymotion"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectedItem(item)}
                          className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          title="Inspect raw JSON"
                        >
                          <Code2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void coordinator.removeItem(item.compositeKey)}
                          className="rounded p-1 text-red-500/80 hover:bg-red-500/10 hover:text-red-600"
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw JSON Inspector Drawer */}
      <RawJsonDrawer
        open={Boolean(inspectedItem)}
        onClose={() => setInspectedItem(null)}
        title={inspectedItem?.title ?? "Saved Item Snapshot"}
        payload={inspectedItem?.snapshot ?? inspectedItem}
      />
    </div>
  );
}
