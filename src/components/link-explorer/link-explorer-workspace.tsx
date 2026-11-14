// Link Explorer Workspace — Advanced Dailymotion Resource Explorer & Channel Intelligence (2026)
//
// What this controls: Unified URL and ID analysis workspace supporting any Dailymotion link,
// handle, video ID, playlist ID, or livestream with automatic detection, manual override,
// API v1 vs v2 switching, deep multi-page catalog discovery, Resource Intelligence Overview,
// fine-grained fetch knobs, Provider vs Local filters, and SHA-256 manifest exports.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileSpreadsheet,
  Globe,
  Layers,
  Library,
  Link as LinkIcon,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Tv,
  User,
  UsersRound,
  X,
} from "lucide-react";
import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import {
  analyzeDailymotionUrlOrId,
  type DailymotionAnalyzedLink,
  type DailymotionResourceKind,
} from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import {
  DEFAULT_SCAN_CONFIG,
  resolveLinkExplorerInput,
} from "@/lib/link-explorer/link-explorer-service";
import type {
  LinkExplorerManifest,
  LinkExplorerResolution,
  ScanBudgetConfig,
  ScanProgressState,
} from "@/lib/link-explorer/link-explorer-types";
import { ResourceIntelligenceOverview } from "./resource-intelligence-overview";
import { AdvancedFetchSettingsPanel } from "./advanced-fetch-settings-panel";
import { ScanProgressBar } from "./scan-progress-bar";
import {
  LinkExplorerFilters,
  type LocalFilterCriteria,
  type LocalSortOption,
} from "./link-explorer-filters";
import { ResultCard, formatDuration, formatViews } from "@/components/discovery/result-card";
import { AddToPlaylistModal } from "@/components/playlists/add-to-playlist-modal";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";
import { ApiErrorAlert } from "@/components/discovery/api-error-alert";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import { cn } from "@/lib/utils/cn";
import { useSynchronizedApiVersion } from "@/lib/navigation/version-sync";
import {
  captureSearchSnapshot,
  getLatestRestorableSearchSnapshot,
} from "@/lib/search-history/search-snapshot-service";
import { captureLinkSubmission } from "@/lib/saved-titles/capture-service";

const EXAMPLE_CHIPS: Array<{ label: string; value: string; kind: DailymotionResourceKind }> = [
  { label: "Video: x8n8x8", value: "https://www.dailymotion.com/video/x8n8x8", kind: "video" },
  { label: "Short: dai.ly/x8n8x8", value: "https://dai.ly/x8n8x8", kind: "video" },
  { label: "Channel: @lemonde", value: "https://www.dailymotion.com/lemonde", kind: "channel" },
  { label: "Playlist: x88apm", value: "https://www.dailymotion.com/playlist/x88apm", kind: "playlist" },
  { label: "Live: x6m7w8", value: "https://www.dailymotion.com/live/x6m7w8", kind: "livestream" },
];

export function LinkExplorerWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();

  const initialVersion = (searchParams.get("v") as ApiVersion) || "v1";
  const initialUrl = searchParams.get("url") || searchParams.get("id") || "";

  const [version, setVersion] = useSynchronizedApiVersion(initialVersion);
  const [input, setInput] = useState(initialUrl || "");
  const [overrideKind, setOverrideKind] = useState<DailymotionResourceKind | "auto">("auto");
  const [analyzedPreview, setAnalyzedPreview] = useState<DailymotionAnalyzedLink | null>(null);

  // Scan Config State
  const [scanConfig, setScanConfig] = useState<ScanBudgetConfig>(DEFAULT_SCAN_CONFIG);
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Core Resolution State
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [resolution, setResolution] = useState<LinkExplorerResolution | null>(null);
  const [rawDrawerOpen, setRawDrawerOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [restoredFromHistory, setRestoredFromHistory] = useState(false);

  // Local In-Memory Filters and Sorters (Zero Network Calls)
  const [activeYearFilter, setActiveYearFilter] = useState<number | null>(null);
  const [localSort, setLocalSort] = useState<LocalSortOption>("api_order");
  const [localFilters, setLocalFilters] = useState<LocalFilterCriteria>({
    searchQuery: "",
    durationRange: "all",
    viewsRange: "all",
    year: null,
  });

  // Sync real-time detection preview when input changes
  useEffect(() => {
    if (input.trim()) {
      setAnalyzedPreview(analyzeDailymotionUrlOrId(input));
    } else {
      setAnalyzedPreview(null);
    }
  }, [input]);

  // Execute resolution ONLY if URL or ID param was explicitly provided in the address
  useEffect(() => {
    if (initialUrl.trim()) {
      void executeResolution(initialUrl.trim(), initialVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVersionChange = (nextVersion: ApiVersion) => {
    setVersion(nextVersion);
    setRestoredFromHistory(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("v", nextVersion);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  async function executeResolution(
    targetInput: string,
    targetVersion: ApiVersion,
    overrideConfig?: Partial<ScanBudgetConfig>
  ) {
    const clean = targetInput.trim();
    if (!clean) return;

    // Abort any ongoing crawler scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    void captureLinkSubmission(clean, targetVersion, analyzedPreview ?? undefined);
    setLoading(true);
    setRestoredFromHistory(false);
    setIsPaused(false);
    setCurrentPage(1);
    setActiveYearFilter(null);

    const effectiveBudgetConfig: ScanBudgetConfig = {
      ...scanConfig,
      ...overrideConfig,
    };

    try {
      const selectedKind = overrideKind === "auto" ? undefined : overrideKind;
      const res = await resolveLinkExplorerInput(
        clean,
        targetVersion,
        selectedKind,
        effectiveBudgetConfig,
        (progress) => setScanProgress(progress),
        abortCtrl.signal
      );

      setResolution(res);
      if (res.scanProgress) {
        setScanProgress(res.scanProgress);
      }

      // Update URL query parameters seamlessly
      const params = new URLSearchParams(searchParams.toString());
      params.set("url", clean);
      params.set("v", targetVersion);
      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (!resolution?.analyzed || loadingMore || !resolution.ok) return;
    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const selectedKind = overrideKind === "auto" ? undefined : overrideKind;
      const res = await resolveLinkExplorerInput(
        input.trim(),
        version,
        selectedKind,
        { ...scanConfig, maxPages: 1 },
        undefined,
        abortControllerRef.current?.signal
      );

      if (res.ok && res.items.length > 0) {
        setResolution((prev) => {
          if (!prev) return res;
          const existingKeys = new Set(prev.items.map((it) => discoveryCompositeKey(it.apiVersion, it.kind, it.id)));
          const newItems = res.items.filter((it) => !existingKeys.has(discoveryCompositeKey(it.apiVersion, it.kind, it.id)));
          const combined = [...prev.items, ...newItems];
          return {
            ...prev,
            items: combined,
            hasMore: res.hasMore,
            page: nextPage,
            intelligence: res.intelligence ?? prev.intelligence,
          };
        });
        setCurrentPage(nextPage);
      } else {
        setResolution((prev) => (prev ? { ...prev, hasMore: false } : prev));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeResolution(input, version);
  };

  const handleChipClick = (value: string) => {
    setInput(value);
    void executeResolution(value, version);
  };

  const handleCopyCanonical = () => {
    const url = resolution?.analyzed?.canonicalUrl || analyzedPreview?.canonicalUrl;
    if (url) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handlePauseScan = () => {
    setIsPaused(true);
  };

  const handleResumeScan = () => {
    setIsPaused(false);
  };

  const handleCancelScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
    setScanProgress((prev) => (prev ? { ...prev, status: "interrupted" } : null));
  };

  // Export Manifest as JSON
  const handleExportJson = () => {
    if (!resolution?.manifest) return;
    const blob = new Blob([JSON.stringify(resolution.manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resolution.manifest.manifestId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Manifest as CSV
  const handleExportCsv = () => {
    if (!resolution?.items || resolution.items.length === 0) return;
    const headers = ["ID", "Title", "Kind", "API_Version", "Views", "Duration_Sec", "Created_At", "Owner", "URL"];
    const rows = resolution.items.map((it) => [
      `"${it.id}"`,
      `"${(it.title || "").replace(/"/g, '""')}"`,
      `"${it.kind}"`,
      `"${it.apiVersion}"`,
      it.views ?? 0,
      it.duration ?? 0,
      `"${it.createdAt || ""}"`,
      `"${(it.ownerName || it.ownerId || "").replace(/"/g, '""')}"`,
      `"${it.url || ""}"`,
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dm-catalog-${resolution.analyzed.identifier}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const effectiveKind =
    overrideKind !== "auto"
      ? overrideKind
      : resolution?.effectiveKind || analyzedPreview?.kind || "video";

  // Compute available years for filtering
  const availableYears = useMemo(() => {
    if (!resolution?.items) return [];
    const set = new Set<number>();
    for (const it of resolution.items) {
      if (it.createdAt) {
        const yr = new Date(it.createdAt).getUTCFullYear();
        if (!Number.isNaN(yr)) set.add(yr);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [resolution?.items]);

  // Apply In-Memory Filtering and Sorting Pipeline
  const visibleItems = useMemo(() => {
    if (!resolution?.items) return [];
    let list = [...resolution.items];

    // 1. Year Filter from Intelligence Overview
    if (activeYearFilter !== null) {
      list = list.filter((it) => {
        if (!it.createdAt) return false;
        const yr = new Date(it.createdAt).getUTCFullYear();
        return yr === activeYearFilter;
      });
    }

    // 2. Year Filter from Local Filters Dropdown
    if (localFilters.year !== null) {
      list = list.filter((it) => {
        if (!it.createdAt) return false;
        const yr = new Date(it.createdAt).getUTCFullYear();
        return yr === localFilters.year;
      });
    }

    // 3. Search Query Filter
    if (localFilters.searchQuery.trim()) {
      const q = localFilters.searchQuery.trim().toLowerCase();
      list = list.filter((it) => {
        const matchTitle = (it.title || "").toLowerCase().includes(q);
        const matchDesc = (it.description || "").toLowerCase().includes(q);
        const matchTags = (it.tags || []).some((t) => t.toLowerCase().includes(q));
        const matchId = (it.id || "").toLowerCase().includes(q);
        const matchOwner = (it.ownerName || it.ownerId || "").toLowerCase().includes(q);
        return matchTitle || matchDesc || matchTags || matchId || matchOwner;
      });
    }

    // 4. Duration Range Filter
    if (localFilters.durationRange !== "all") {
      list = list.filter((it) => {
        if (it.duration === null || it.duration === undefined) return false;
        if (localFilters.durationRange === "short") return it.duration < 300;
        if (localFilters.durationRange === "medium") return it.duration >= 300 && it.duration <= 1200;
        if (localFilters.durationRange === "long") return it.duration > 1200;
        return true;
      });
    }

    // 5. Views Range Filter
    if (localFilters.viewsRange !== "all") {
      list = list.filter((it) => {
        const v = it.views || 0;
        if (localFilters.viewsRange === "under_1k") return v < 1000;
        if (localFilters.viewsRange === "1k_10k") return v >= 1000 && v < 10000;
        if (localFilters.viewsRange === "10k_100k") return v >= 10000 && v < 100000;
        if (localFilters.viewsRange === "over_100k") return v >= 100000;
        return true;
      });
    }

    // 6. Local Sorter
    if (localSort === "newest") {
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
    } else if (localSort === "oldest") {
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tA - tB;
      });
    } else if (localSort === "views_desc") {
      list.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (localSort === "views_asc") {
      list.sort((a, b) => (a.views || 0) - (b.views || 0));
    } else if (localSort === "duration_desc") {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else if (localSort === "duration_asc") {
      list.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else if (localSort === "title_asc") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (localSort === "title_desc") {
      list.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    } else if (localSort === "engagement_desc") {
      list.sort((a, b) => {
        const likesA = Number(a.extra?.likes_total) || 0;
        const viewsA = a.views || 1;
        const ratioA = viewsA > 0 ? likesA / viewsA : 0;

        const likesB = Number(b.extra?.likes_total) || 0;
        const viewsB = b.views || 1;
        const ratioB = viewsB > 0 ? likesB / viewsB : 0;

        return ratioB - ratioA;
      });
    }

    return list;
  }, [resolution?.items, activeYearFilter, localFilters, localSort]);

  return (
    <div className="space-y-6">
      {/* Top Header & API Version Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <LinkIcon className="h-6 w-6 text-primary" />
              Link Explorer & Channel Intelligence
            </h1>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              2026 Workspace
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Exhaustive discovery, profile analytics, and multi-page catalog crawler for Dailymotion resources.
          </p>
        </div>

        {/* Version Switcher Tabs */}
        <div className="flex items-center rounded-lg border border-border bg-surface p-1 shadow-xs">
          <button
            type="button"
            onClick={() => handleVersionChange("v1")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
              version === "v1"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            V1 — Legacy
          </button>
          <button
            type="button"
            onClick={() => handleVersionChange("v2")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
              version === "v2"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            V2 — Current
          </button>
        </div>
      </div>

      {/* Restored From History Notice */}
      {restoredFromHistory && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                Restored from local search history · Zero API Calls
              </p>
              <p className="text-xs text-muted-foreground">
                Previous Link Explorer resolution loaded directly from IndexedDB without querying Dailymotion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void executeResolution(input, version)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-3 text-xs font-black text-white cursor-pointer hover:opacity-90 shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-analyze Link
          </button>
        </div>
      )}

      {/* Universal Search Form */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Input with Clear Button */}
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste Dailymotion URL, video ID (x8n8x8), channel (@handle), playlist ID..."
                className="w-full h-11 rounded-lg border border-border bg-surface px-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-2xs font-mono"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                  title="Clear input"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Resource Type Override Dropdown */}
            <div className="w-full md:w-56 shrink-0">
              <select
                value={overrideKind}
                onChange={(e) => setOverrideKind(e.target.value as DailymotionResourceKind | "auto")}
                className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer font-medium"
              >
                <option value="auto">Auto-Detect Type</option>
                <option value="video">Force Video (x...)</option>
                <option value="channel">Force Channel / Profile</option>
                <option value="playlist">Force Playlist</option>
                <option value="livestream">Force Livestream</option>
                <option value="user">Force User</option>
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Analyze & Explore
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Example Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
          <span className="font-semibold text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Examples:
          </span>
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleChipClick(chip.value)}
              className="rounded-md border border-border/70 bg-surface px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-muted hover:border-border transition-colors cursor-pointer font-mono text-[11px]"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Fetch Settings Panel (Expandable directly beneath search input) */}
      <AdvancedFetchSettingsPanel
        version={version}
        config={scanConfig}
        onChangeConfig={(next) => setScanConfig(next)}
        onResetDefaults={() => setScanConfig(DEFAULT_SCAN_CONFIG)}
      />

      {/* Real-Time Detection Pill Banner */}
      {analyzedPreview && (
        <div className="rounded-xl border border-border bg-surface-raised/40 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
              Detected Target:
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize",
                effectiveKind === "video" && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
                effectiveKind === "channel" && "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20",
                effectiveKind === "playlist" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
                effectiveKind === "livestream" && "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20",
                effectiveKind === "user" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                effectiveKind === "search" && "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20",
                effectiveKind === "unsupported" && "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
              )}
            >
              {effectiveKind}
            </span>
            <span className="text-muted-foreground font-mono">
              ID: {analyzedPreview.identifier}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {analyzedPreview.canonicalUrl && (
              <button
                type="button"
                onClick={handleCopyCanonical}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
              >
                {copiedUrl ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copiedUrl ? "Copied" : "Copy URL"}
              </button>
            )}

            {resolution && (
              <>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                  title="Export Manifest as JSON"
                >
                  <Download className="h-3 w-3" />
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                  title="Export Catalog as CSV"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => setRawDrawerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <FileCode2 className="h-3 w-3" />
                  Raw JSON
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Live Scan Progress Monitor */}
      {scanProgress && (
        <ScanProgressBar
          progress={scanProgress}
          isPaused={isPaused}
          onPause={handlePauseScan}
          onResume={handleResumeScan}
          onCancel={handleCancelScan}
        />
      )}

      {/* Error / Redirect State */}
      {resolution && !resolution.ok && (
        resolution.reason === "keyword_search_redirect" ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
                <Search className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">
                  Keyword Search Query Detected
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {resolution.error}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={`/global-search?q=${encodeURIComponent(resolution.analyzed.identifier)}&v=${version}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-all cursor-pointer shadow-sm"
              >
                <Search className="h-3.5 w-3.5" />
                Search &ldquo;{resolution.analyzed.identifier}&rdquo; in Global Search &rarr;
              </Link>
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setResolution(null);
                  setScanProgress(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <ApiErrorAlert
            error={resolution.normalized || {
              error: resolution.error,
              reason: resolution.reason,
              status: resolution.status,
              apiVersion: resolution.version,
              remedy: resolution.reason === "auth_missing" ? "Dailymotion API v2 requires client credentials. Configure PRIVATE_DAILYMOTION_API_KEY_V2 in Settings." : null,
            }}
            onRetry={() => void executeResolution(input, version)}
            onSwitchVersion={(target) => {
              setVersion(target);
              const params = new URLSearchParams(searchParams.toString());
              params.set("v", target);
              router.replace(`/link-explorer?${params.toString()}`);
            }}
          />
        )
      )}

      {/* Initial Empty / Guide State */}
      {!resolution && !loading && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LinkIcon className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Direct Link & Resource Inspector
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Paste any Dailymotion video link, short URL, channel handle, playlist URL, or video ID above to fetch its exact live metadata and browse its catalog.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
            <span className="text-muted-foreground">Looking to search by keywords?</span>
            <Link
              href="/global-search"
              className="font-bold text-primary hover:underline inline-flex items-center gap-1"
            >
              Go to Global Search <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Resolution Workspace Display */}
      {resolution && resolution.ok && (
        <div className="space-y-6">
          {/* RESOURCE INTELLIGENCE OVERVIEW (Positioned directly below search input) */}
          {resolution.intelligence && (
            <ResourceIntelligenceOverview
              data={resolution.intelligence}
              activeYearFilter={activeYearFilter}
              onSelectYearFilter={(yr) => setActiveYearFilter(yr)}
            />
          )}

          {/* PROVIDER VS LOCAL FILTER & SORT BAR */}
          {resolution.items.length > 0 && (
            <LinkExplorerFilters
              version={version}
              serverSort={scanConfig.serverSort || "recent"}
              onChangeServerSort={(sort) => {
                setScanConfig((prev) => ({ ...prev, serverSort: sort }));
                void executeResolution(input, version, { serverSort: sort });
              }}
              localSort={localSort}
              onChangeLocalSort={(s) => setLocalSort(s)}
              filters={localFilters}
              onChangeFilters={(f) => setLocalFilters(f)}
              totalLoadedItems={resolution.items.length}
              totalVisibleItems={visibleItems.length}
              availableYears={availableYears}
            />
          )}

          {/* CATALOG ITEMS RESPONSIVE GRID */}
          {visibleItems.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleItems.map((cardItem) => {
                  const cKey = discoveryCompositeKey(cardItem.apiVersion, cardItem.kind, cardItem.id);
                  const isSaved = merged.savedKeys.has(cKey) || workspace.isItemSaved(cardItem.apiVersion, cardItem.kind, cardItem.id);

                  return (
                    <ResultCard
                      key={cKey}
                      item={cardItem}
                      saved={isSaved}
                      favorite={merged.favoriteKeys.has(cKey)}
                      collections={merged.collections.map((c) => ({ id: c.id, name: c.name }))}
                      onToggleFavorite={() => {
                        if (!isSaved) {
                          void merged.coordinator.toggleSaveItem(cardItem).then(() =>
                            merged.coordinator.setSavedItemFavorite(cKey, true)
                          );
                        } else {
                          void merged.coordinator.setSavedItemFavorite(cKey, !merged.favoriteKeys.has(cKey));
                        }
                      }}
                      onAddToCollection={(collId) => void merged.coordinator.addItemToCollection(collId, cardItem)}
                      onToggleSave={() => {
                        void merged.coordinator.toggleSaveItem(cardItem);
                        if (workspace.isItemSaved(cardItem.apiVersion, cardItem.kind, cardItem.id)) {
                          workspace.removeItem(cardItem.apiVersion, cardItem.kind, cardItem.id);
                        } else {
                          workspace.saveItem(cardItem);
                        }
                      }}
                    />
                  );
                })}
              </div>

              {/* Load More Pagination for Multi-Page Catalogs */}
              {resolution.hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-black text-primary-foreground hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading Next Page...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Load More Videos (Page {currentPage + 1})
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            resolution.items.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-card/60 p-8 text-center space-y-2">
                <p className="text-sm font-bold text-foreground">
                  No items match the current local filter criteria.
                </p>
                <p className="text-xs text-muted-foreground">
                  Try clearing your search query, adjusting the duration slider, or selecting another year.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveYearFilter(null);
                    setLocalFilters({
                      searchQuery: "",
                      durationRange: "all",
                      viewsRange: "all",
                      year: null,
                    });
                    setLocalSort("api_order");
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                >
                  Clear All Filters
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Raw JSON Inspection Drawer */}
      {resolution && (
        <RawJsonDrawer
          open={rawDrawerOpen}
          onClose={() => setRawDrawerOpen(false)}
          title={`Raw API Resolution: ${resolution.analyzed.identifier}`}
          payload={resolution}
        />
      )}
    </div>
  );
}
