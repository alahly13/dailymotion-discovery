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
  Play,
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
import {
  computeResourceIntelligence,
  type CustomDateRangeConfig,
  type LinkExplorerManifest,
  type LinkExplorerResolution,
  type RetrievalDirection,
  type RetrievalPeriod,
  type RetrievalStrategy,
  type ScanBudgetConfig,
  type ScanProgressState,
  type TargetIdentity,
} from "@/lib/link-explorer/link-explorer-types";
import {
  getNextPendingPeriod,
  isLedgerFullyCompleted,
} from "@/lib/link-explorer/catalog-partition-engine";
import { CatalogDeduplicator } from "@/lib/link-explorer/deduplication-service";
import { CatalogRetrievalStrategyPanel } from "./catalog-retrieval-strategy-panel";
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
  appendSearchSnapshotPage,
  captureSearchSnapshot,
  getLatestRestorableSearchSnapshot,
} from "@/lib/search-history/search-snapshot-service";
import { getClientOwnerId } from "@/lib/saved-titles/capture-service";
import {
  saveScanCheckpoint,
  getScanCheckpoint,
  deleteScanCheckpoint,
  buildCheckpointKey,
  acquireScanLease,
  releaseScanLease,
  isScanLeaseActive,
} from "@/lib/link-explorer/scan-checkpoint-service";
import {
  persistProgressiveBatch,
  getCatalogItemsForCheckpoint,
  countCatalogItemsForCheckpoint,
} from "@/lib/link-explorer/catalog-persistence-service";
import { LocalCatalogSearchBar } from "./local-catalog-search-bar";
import { CatalogFetchHistoryPanel } from "./catalog-fetch-history-panel";
import type { LocalCatalogSearchResult } from "@/lib/link-explorer/local-catalog-search-service";
import { saveCompletedExplorationManifest } from "@/lib/link-explorer/completed-explorations-service";
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

  // Time-Partitioned Catalog Retrieval Strategy State (2026)
  const [retrievalStrategy, setRetrievalStrategy] = useState<RetrievalStrategy>("automatic_maximum_coverage");
  const [retrievalDirection, setRetrievalDirection] = useState<RetrievalDirection>("newest_to_oldest");
  const [customRangeConfig, setCustomRangeConfig] = useState<CustomDateRangeConfig>({
    startDate: "2005-01-01",
    endDate: new Date().toISOString().substring(0, 10),
    granularity: "month",
  });

  // Core Resolution State
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [lastAppendedToast, setLastAppendedToast] = useState<string | null>(null);
  const latestSnapshotIdRef = useRef<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [resolution, setResolution] = useState<LinkExplorerResolution | null>(null);
  const [rawDrawerOpen, setRawDrawerOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [restoredFromHistory, setRestoredFromHistory] = useState(false);
  const [isSavingManifest, setIsSavingManifest] = useState(false);
  const [savedManifestNotice, setSavedManifestNotice] = useState<string | null>(null);
  const [isContinuingDeep, setIsContinuingDeep] = useState(false);

  // Local In-Memory Filters and Sorters (Zero Network Calls)
  const [activeYearFilter, setActiveYearFilter] = useState<number | null>(null);
  const [localSort, setLocalSort] = useState<LocalSortOption>("api_order");
  const [localFilters, setLocalFilters] = useState<LocalFilterCriteria>({
    titleSearch: "",
    searchQuery: "",
    durationRange: "all",
    viewsRange: "all",
    year: null,
  });

  // Concurrency & Local Catalog Search State (2026)
  const tabIdRef = useRef<string>(
    typeof window !== "undefined"
      ? `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      : "tab_ssr"
  );
  const [localSearchResult, setLocalSearchResult] = useState<LocalCatalogSearchResult | null>(null);
  const [activePeriodFilter, setActivePeriodFilter] = useState<string | null>(null);

  // Sync real-time detection preview when input changes
  useEffect(() => {
    if (input.trim()) {
      setAnalyzedPreview(analyzeDailymotionUrlOrId(input));
    } else {
      setAnalyzedPreview(null);
    }
  }, [input]);

  // Execute resolution if URL or ID param was provided; else restore from IndexedDB
  useEffect(() => {
    const cleanInitial = initialUrl.trim();
    if (cleanInitial) {
      void (async () => {
        try {
          const owner = await getClientOwnerId();
          const analyzed = analyzeDailymotionUrlOrId(cleanInitial);
          const chk = await getScanCheckpoint(owner, initialVersion, analyzed.kind, analyzed.identifier);
          if (chk) {
            const storedItems = await getCatalogItemsForCheckpoint(chk.id);
            if (storedItems.length > 0) {
              const intelligence = computeResourceIntelligence(
                storedItems,
                storedItems[0] ?? null,
                initialVersion,
                analyzed,
                chk.status,
                {
                  providerReportedLifetimeTotal: chk.lifetimeTotal,
                  providerReportedTotal: chk.queryTotal,
                  targetIdentity: chk.targetIdentity,
                }
              );

              setResolution({
                ok: true,
                analyzed,
                targetIdentity: chk.targetIdentity,
                effectiveKind: chk.resourceType,
                version: initialVersion,
                item: storedItems[0] ?? null,
                items: storedItems,
                hasMore: chk.status === "fetching_pages" || chk.canResume,
                page: chk.currentPage || 1,
                total: chk.lifetimeTotal || chk.queryTotal || storedItems.length,
                lifetimeTotal: chk.lifetimeTotal,
                nextCursor: chk.nextCursor,
                intelligence,
                scanProgress: null,
                manifest: null,
                retrievalLedger: chk.retrievalLedger,
                totalRawObserved: chk.totalRawObserved || storedItems.length,
                totalUniqueRetained: storedItems.length,
                totalDuplicatesDetected: chk.totalDuplicatesDetected || 0,
                checkpoint: {
                  nextPage: (chk.currentPage || 1) + 1,
                  nextCursor: chk.nextCursor || null,
                  visitedPages: chk.visitedPages || [],
                  visitedCursors: chk.visitedCursors || [],
                  canResume: chk.canResume,
                },
              });
              setCurrentPage(chk.currentPage || 1);
              setRestoredFromHistory(true);
              return;
            }
          }
        } catch {
          // Fallback to fresh execution
        }
        void executeResolution(cleanInitial, initialVersion);
      })();
    } else {
      void getLatestRestorableSearchSnapshot("link_explorer", { apiVersion: version }).then((replay) => {
        if (replay && replay.items.length > 0) {
          setInput(replay.snapshot.query);
          const analyzed = analyzeDailymotionUrlOrId(replay.snapshot.query);
          const restoredKind = (replay.snapshot.resourceType?.toLowerCase() || analyzed.kind || "video") as DailymotionResourceKind;
          const intelligence = computeResourceIntelligence(
            replay.items,
            replay.items[0] ?? null,
            replay.snapshot.apiVersion,
            analyzed,
            "completed"
          );

          const targetIdentity: TargetIdentity = {
            rawInput: replay.snapshot.query,
            canonicalUrl: analyzed.canonicalUrl || `https://www.dailymotion.com/${analyzed.identifier}`,
            legacyUserId: replay.snapshot.apiVersion === "v1" && (restoredKind === "channel" || restoredKind === "user") ? analyzed.identifier : null,
            legacyUsername: replay.snapshot.apiVersion === "v1" && (restoredKind === "channel" || restoredKind === "user") ? analyzed.identifier : null,
            v2ProfileId: replay.snapshot.apiVersion === "v2" && (restoredKind === "channel" || restoredKind === "user") ? analyzed.identifier : null,
            resolvedKind: restoredKind,
            selectedApiVersion: replay.snapshot.apiVersion,
          };

          setResolution({
            ok: true,
            analyzed,
            targetIdentity,
            effectiveKind: restoredKind,
            version: replay.snapshot.apiVersion,
            item: replay.items[0] ?? null,
            items: replay.items,
            hasMore: replay.snapshot.hasMore,
            page: replay.snapshot.currentPage || 1,
            total: replay.snapshot.totalResults || replay.items.length,
            intelligence,
            scanProgress: null,
            manifest: null,
          });
          setCurrentPage(replay.snapshot.currentPage || 1);
          setRestoredFromHistory(true);
        }
      }).catch(() => {});
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
    setLoadMoreError(null);
    setLastAppendedToast(null);

    const effectiveBudgetConfig: ScanBudgetConfig = {
      ...scanConfig,
      retrievalStrategy,
      retrievalDirection,
      customRangeConfig: retrievalStrategy === "custom_range" ? customRangeConfig : undefined,
      ...overrideConfig,
    };

    try {
      const selectedKind = overrideKind === "auto" ? undefined : overrideKind;
      const owner = await getClientOwnerId();
      const checkpointKey = buildCheckpointKey(owner, targetVersion, selectedKind || "video", clean);

      const res = await resolveLinkExplorerInput(
        clean,
        targetVersion,
        selectedKind,
        effectiveBudgetConfig,
        (progress) => setScanProgress(progress),
        abortCtrl.signal,
        undefined,
        async (batch) => {
          try {
            await persistProgressiveBatch({
              checkpointKey,
              scanId: `scan-${Date.now()}`,
              ownerId: owner,
              targetResourceId: clean,
              apiVersion: targetVersion,
              items: batch.items,
              periodId: batch.period?.periodId || null,
              page: batch.page,
            });
            // Append-only state update: keep previously loaded items and update cumulative counters
            setResolution((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                items: batch.cumulativeItems,
                page: batch.page,
                currentPeriod: batch.period || prev.currentPeriod,
                totalUniqueRetained: batch.cumulativeItems.length,
              };
            });
          } catch (commitErr) {
            console.warn("[LinkExplorer] Progressive batch commit failed:", commitErr);
          }
        }
      );

      setResolution(res);
      if (res.scanProgress) {
        setScanProgress(res.scanProgress);
      }

      // Persist checkpoint to IndexedDB immediately upon successful resolution
      if (res.ok && res.items.length > 0) {
        void saveCheckpointFromResolution(res);

        // Capture snapshot ID for appendSearchSnapshotPage
        captureSearchSnapshot({
          workspace: "link_explorer",
          query: clean,
          route: "/link-explorer",
          apiVersion: targetVersion,
          resourceType: (res.effectiveKind || "video").toUpperCase(),
          mode: targetVersion === "v1" ? "search" : "browse",
          apiParams: { input: clean, version: targetVersion, effectiveKind: res.effectiveKind },
          rawResponse: { totalRetrieved: res.items.length },
          items: res.items,
          totalResults: res.total || res.items.length,
          hasMore: res.hasMore,
          pageIndex: res.page || 1,
        }).then((id) => {
          latestSnapshotIdRef.current = id;
        }).catch(() => {});
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

  // Persists a scan checkpoint durably in IndexedDB
  async function saveCheckpointFromResolution(res: LinkExplorerResolution) {
    if (!res.ok) return;
    try {
      const owner = await getClientOwnerId();
      await saveScanCheckpoint({
        id: buildCheckpointKey(owner, version, res.effectiveKind, res.analyzed.identifier),
        ownerId: owner,
        scanId: res.manifest?.manifestId || `scan-${Date.now()}`,
        apiVersion: version,
        resourceType: res.effectiveKind,
        resourceId: res.analyzed.identifier,
        canonicalUrl: res.analyzed.canonicalUrl || "",
        targetIdentity: res.targetIdentity,
        scanConfig: {
          ...scanConfig,
          retrievalStrategy,
          retrievalDirection,
          customRangeConfig,
        },
        currentPage: res.page || 1,
        nextCursor: res.nextCursor,
        visitedPages: res.checkpoint?.visitedPages || [],
        visitedCursors: res.checkpoint?.visitedCursors || [],
        completedPages: res.page || 1,
        itemsRetrieved: res.items.length,
        lifetimeTotal: res.lifetimeTotal ?? null,
        queryTotal: res.total ?? null,
        oldestItemDate: res.intelligence?.chronology.oldestVideo?.date || null,
        newestItemDate: res.intelligence?.chronology.newestVideo?.date || null,
        status: res.hasMore
          ? "fetching_pages"
          : res.hasRemainingCatalog
          ? "more_results_available"
          : "completed",
        completedWindows: res.diagnostics?.windows || [],
        retrievalLedger: res.retrievalLedger,
        retrievalStrategy,
        retrievalDirection,
        currentPeriodId: res.currentPeriod?.periodId || null,
        totalRawObserved: res.totalRawObserved || res.items.length,
        totalUniqueRetained: res.items.length,
        totalDuplicatesDetected: res.totalDuplicatesDetected || res.duplicatesSkipped || 0,
        updatedAt: new Date().toISOString(),
        canResume: true,
      });
    } catch {
      // Non-blocking checkpoint save
    }
  }

  // Finalize Catalog: Reconcile, Deduplicate, Compute Checksum, and Commit Final Manifest
  async function handleFinalizeCatalog() {
    if (!resolution || !resolution.ok || resolution.items.length === 0) return;
    setIsSavingManifest(true);
    setLoadMoreError(null);
    try {
      const owner = await getClientOwnerId();
      // 1. Run final canonical deduplication and checksum verification
      const deduplicator = new CatalogDeduplicator(resolution.items);
      const reconciled = await deduplicator.reconcileFinalCatalog(resolution.analyzed.identifier);

      // 2. Commit final consolidated manifest into Completed Explorations
      await saveCompletedExplorationManifest({
        manifestId: `manifest-${Date.now()}-${resolution.analyzed.identifier}`,
        ownerId: owner,
        provider: "dailymotion",
        apiVersion: version,
        resourceKind: resolution.effectiveKind,
        resourceId: resolution.analyzed.identifier,
        canonicalSourceUrl: resolution.analyzed.canonicalUrl || "",
        resourceTitle: resolution.item?.title || resolution.analyzed.displayLabel || resolution.analyzed.identifier,
        resourceDescription: resolution.item?.description || null,
        resourceThumbnail: resolution.item?.thumbnail || null,
        targetIdentity: resolution.targetIdentity,
        scanId: resolution.manifest?.manifestId || `scan-${Date.now()}`,
        scanStrategy: scanConfig.strategy,
        retrievalStrategy: scanConfig.retrievalStrategy || resolution.retrievalLedger?.strategy || retrievalStrategy,
        retrievalDirection: scanConfig.retrievalDirection || resolution.retrievalLedger?.direction || retrievalDirection,
        createdAt: resolution.manifest?.createdAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalUniqueItems: reconciled.canonicalItems.length,
        providerReportedLifetimeTotal: resolution.lifetimeTotal ?? null,
        providerReportedQueryTotal: resolution.total ?? null,
        duplicatesSkipped: reconciled.summary.totalDuplicatesDetected,
        omittedOrUnavailableReferences: resolution.omittedOrUnavailableReferences ?? 0,
        totalRawObserved: reconciled.summary.totalRawObserved,
        totalDuplicatesDetected: reconciled.summary.totalDuplicatesDetected,
        oldestItemDate: reconciled.oldestItemDate,
        newestItemDate: reconciled.newestItemDate,
        items: reconciled.canonicalItems,
        retrievalLedger: resolution.retrievalLedger,
        paginationMetadata: {
          totalPagesFetched: resolution.page || 1,
          windowsRetrieved: resolution.diagnostics?.windows || [],
        },
        sha256Checksum: reconciled.sha256Checksum,
        status: resolution.items.length >= (resolution.lifetimeTotal ?? resolution.items.length)
          ? "complete_within_verified_scope"
          : "completed_with_known_limitations",
      });

      // 3. Remove in-progress checkpoint once finalized
      await deleteScanCheckpoint(owner, version, resolution.effectiveKind, resolution.analyzed.identifier);

      setSavedManifestNotice("Catalog successfully finalized & saved to Completed Explorations!");
      setTimeout(() => setSavedManifestNotice(null), 4000);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Failed to finalize catalog.");
    } finally {
      setIsSavingManifest(false);
    }
  }

  // Continue Retrieval Action (Supports: next_page within period, next_period, all_remaining, retry_failed, or specific_period)
  async function handleContinueRetrieval(
    mode: "next_page" | "next_period" | "all_remaining" | "retry_failed" | "specific_period" = "next_page",
    targetPeriodParam?: RetrievalPeriod
  ) {
    if (!resolution?.analyzed || loadingMore || !resolution.ok) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    if (mode === "all_remaining") setIsContinuingDeep(true);

    const owner = await getClientOwnerId();
    const checkpointKey = buildCheckpointKey(owner, version, resolution.effectiveKind, resolution.analyzed.identifier);
    let existingChk = await getScanCheckpoint(owner, version, resolution.effectiveKind, resolution.analyzed.identifier);

    // Multi-tab lease protection: check if another tab is currently crawling this resource
    if (existingChk && isScanLeaseActive(existingChk, tabIdRef.current)) {
      setLoadMoreError("Another browser tab holds an active retrieval lease on this catalog. Operation paused to prevent race conditions.");
      setLoadingMore(false);
      setIsContinuingDeep(false);
      return;
    }

    if (existingChk) {
      await acquireScanLease(existingChk, tabIdRef.current);
    }

    // Shared progressive commit callback: append-only IndexedDB persistence & UI state sync
    const onProgressiveCommit = async (batch: {
      page: number;
      items: DiscoveryItem[];
      cumulativeItems: DiscoveryItem[];
      period?: RetrievalPeriod;
      checkpoint?: any;
    }) => {
      try {
        await persistProgressiveBatch({
          checkpointKey,
          scanId: `scan-${Date.now()}`,
          ownerId: owner,
          targetResourceId: resolution.analyzed.identifier,
          apiVersion: version,
          items: batch.items,
          periodId: batch.period?.periodId || null,
          page: batch.page,
        });

        // Append-only state update: never discard existing items, increment counters reactively
        setResolution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: batch.cumulativeItems,
            page: batch.page,
            currentPeriod: batch.period || prev.currentPeriod,
            totalUniqueRetained: batch.cumulativeItems.length,
          };
        });
      } catch (commitErr) {
        console.warn("[LinkExplorer] Progressive batch commit failed:", commitErr);
      }
    };

    try {
      const selectedKind = overrideKind === "auto" ? undefined : overrideKind;
      let currentRes = resolution;
      const ledger = currentRes.retrievalLedger;

      // ============================================================
      // A. LOAD NEXT PAGE (Within the current date window / period)
      // ============================================================
      if (mode === "next_page") {
        const activePeriod =
          currentRes.currentPeriod ||
          (ledger?.activePeriodId ? ledger.periods.find((p) => p.periodId === ledger.activePeriodId) : null);
        const nextPage = (activePeriod?.nextPage || currentPage) + 1;
        const nextCursor = activePeriod?.nextCursor || currentRes.nextCursor || null;

        const res = await resolveLinkExplorerInput(
          input.trim(),
          version,
          selectedKind,
          { ...scanConfig, maxPages: 1 },
          (progress) => setScanProgress(progress),
          abortControllerRef.current?.signal,
          {
            startPage: nextPage,
            nextCursor,
            existingItems: currentRes.items,
            existingDuplicates: currentRes.totalDuplicatesDetected ?? currentRes.duplicatesSkipped ?? 0,
            visitedPages: currentRes.checkpoint?.visitedPages || [],
            visitedCursors: currentRes.checkpoint?.visitedCursors || [],
            providerReportedTotal: currentRes.total,
            providerReportedLifetimeTotal: currentRes.lifetimeTotal,
            omittedOrUnavailableReferences: currentRes.omittedOrUnavailableReferences ?? 0,
            diagnostics: currentRes.diagnostics,
            retrievalLedger: ledger,
            currentPeriod: activePeriod || undefined,
            targetPeriodId: activePeriod?.periodId,
          },
          onProgressiveCommit
        );

        if (!res.ok) {
          setLoadMoreError(res.error || "Failed to load next page.");
          return;
        }

        const addedCount = res.items.length - currentRes.items.length;
        setResolution(res);
        setCurrentPage(nextPage);
        if (res.scanProgress) setScanProgress(res.scanProgress);
        setLastAppendedToast(`${addedCount} additional records loaded on page ${nextPage} (${res.items.length} total)`);
        await saveCheckpointFromResolution(res);
      }

      // ============================================================
      // B. LOAD NEXT PERIOD (Month, Year, or Custom Interval)
      // ============================================================
      else if (mode === "next_period") {
        if (!ledger) {
          setLoadMoreError("No active retrieval ledger found.");
          return;
        }
        const nextPeriod = getNextPendingPeriod(ledger);
        if (!nextPeriod) {
          setLastAppendedToast("All periods in the selected scope are already completed!");
          return;
        }

        ledger.activePeriodId = nextPeriod.periodId;
        nextPeriod.status = "in_progress";

        const res = await resolveLinkExplorerInput(
          input.trim(),
          version,
          selectedKind,
          { ...scanConfig, maxPages: 1 },
          (progress) => setScanProgress(progress),
          abortControllerRef.current?.signal,
          {
            startPage: 1,
            nextCursor: null,
            existingItems: currentRes.items,
            existingDuplicates: currentRes.totalDuplicatesDetected ?? currentRes.duplicatesSkipped ?? 0,
            providerReportedTotal: currentRes.total,
            providerReportedLifetimeTotal: currentRes.lifetimeTotal,
            omittedOrUnavailableReferences: currentRes.omittedOrUnavailableReferences ?? 0,
            diagnostics: currentRes.diagnostics,
            retrievalLedger: ledger,
            currentPeriod: nextPeriod,
            targetPeriodId: nextPeriod.periodId,
          },
          onProgressiveCommit
        );

        if (!res.ok) {
          setLoadMoreError(res.error || `Failed to fetch period ${nextPeriod.label}.`);
          return;
        }

        const addedCount = res.items.length - currentRes.items.length;
        setResolution(res);
        setCurrentPage(1);
        if (res.scanProgress) setScanProgress(res.scanProgress);
        setLastAppendedToast(`Loaded period ${nextPeriod.label} (+${addedCount} items, ${res.items.length} total)`);
        await saveCheckpointFromResolution(res);
      }

      // ============================================================
      // C. RETRY FAILED PERIODS
      // ============================================================
      else if (mode === "retry_failed") {
        if (!ledger) return;
        const failedPeriod = ledger.periods.find((p) => p.status === "failed");
        if (!failedPeriod) {
          setLastAppendedToast("No failed periods found.");
          return;
        }
        failedPeriod.status = "pending";
        failedPeriod.error = null;
        ledger.activePeriodId = failedPeriod.periodId;
        await handleContinueRetrieval("next_period");
      }

      // ============================================================
      // D. RESUME SPECIFIC PERIOD FROM HISTORY PANEL
      // ============================================================
      else if (mode === "specific_period") {
        if (!ledger || !targetPeriodParam) return;
        ledger.activePeriodId = targetPeriodParam.periodId;
        targetPeriodParam.status = "in_progress";

        const res = await resolveLinkExplorerInput(
          input.trim(),
          version,
          selectedKind,
          { ...scanConfig, maxPages: 1 },
          (progress) => setScanProgress(progress),
          abortControllerRef.current?.signal,
          {
            startPage: targetPeriodParam.nextPage || 1,
            nextCursor: targetPeriodParam.nextCursor || null,
            existingItems: currentRes.items,
            existingDuplicates: currentRes.totalDuplicatesDetected ?? currentRes.duplicatesSkipped ?? 0,
            providerReportedTotal: currentRes.total,
            providerReportedLifetimeTotal: currentRes.lifetimeTotal,
            omittedOrUnavailableReferences: currentRes.omittedOrUnavailableReferences ?? 0,
            diagnostics: currentRes.diagnostics,
            retrievalLedger: ledger,
            currentPeriod: targetPeriodParam,
            targetPeriodId: targetPeriodParam.periodId,
          },
          onProgressiveCommit
        );

        if (!res.ok) {
          setLoadMoreError(res.error || `Failed to resume period ${targetPeriodParam.label}.`);
          return;
        }

        const addedCount = res.items.length - currentRes.items.length;
        setResolution(res);
        setCurrentPage(targetPeriodParam.nextPage || 1);
        if (res.scanProgress) setScanProgress(res.scanProgress);
        setLastAppendedToast(`Resumed period ${targetPeriodParam.label} (+${addedCount} items, ${res.items.length} total)`);
        await saveCheckpointFromResolution(res);
      }

      // ============================================================
      // E. FETCH ALL REMAINING PERIODS (Automated Loop with Pause/Resume)
      // ============================================================
      else if (mode === "all_remaining") {
        let keepRunning = true;
        let batchCount = 0;
        const maxBatches = 60; // Safe bounded circuit breaker

        while (keepRunning && batchCount < maxBatches) {
          if (abortControllerRef.current?.signal.aborted) break;
          batchCount++;

          const curLedger = currentRes.retrievalLedger;
          if (!curLedger) break;

          let targetP = currentRes.currentPeriod;
          let targetPage = 1;
          let targetCursor: string | null = null;

          if (targetP && (targetP.status === "in_progress" || targetP.status === "pending") && targetP.hasMore) {
            targetPage = (targetP.nextPage || 1);
            targetCursor = targetP.nextCursor || null;
          } else {
            const nextP = getNextPendingPeriod(curLedger);
            if (!nextP || isLedgerFullyCompleted(curLedger)) {
              keepRunning = false;
              break;
            }
            curLedger.activePeriodId = nextP.periodId;
            nextP.status = "in_progress";
            targetP = nextP;
            targetPage = 1;
            targetCursor = null;
          }

          const res = await resolveLinkExplorerInput(
            input.trim(),
            version,
            selectedKind,
            { ...scanConfig, maxPages: 1 },
            (progress) => setScanProgress(progress),
            abortControllerRef.current?.signal,
            {
              startPage: targetPage,
              nextCursor: targetCursor,
              existingItems: currentRes.items,
              existingDuplicates: currentRes.totalDuplicatesDetected ?? currentRes.duplicatesSkipped ?? 0,
              providerReportedTotal: currentRes.total,
              providerReportedLifetimeTotal: currentRes.lifetimeTotal,
              omittedOrUnavailableReferences: currentRes.omittedOrUnavailableReferences ?? 0,
              diagnostics: currentRes.diagnostics,
              retrievalLedger: curLedger,
              currentPeriod: targetP,
              targetPeriodId: targetP.periodId,
            },
            onProgressiveCommit
          );

          if (!res.ok) {
            setLoadMoreError(res.error || "Error during automated retrieval.");
            break;
          }

          currentRes = res;
          setResolution(res);
          setCurrentPage(targetPage);
          if (res.scanProgress) setScanProgress(res.scanProgress);
          await saveCheckpointFromResolution(res);

          // Check if entire ledger completed
          if (isLedgerFullyCompleted(res.retrievalLedger || curLedger)) {
            keepRunning = false;
            await handleFinalizeCatalog();
            break;
          }

          if (scanConfig.throttleMs > 0) {
            await new Promise((r) => setTimeout(r, scanConfig.throttleMs));
          }
        }
      }
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Error continuing retrieval.");
    } finally {
      try {
        existingChk = await getScanCheckpoint(owner, version, resolution.effectiveKind, resolution.analyzed.identifier);
        if (existingChk) {
          await releaseScanLease(existingChk, tabIdRef.current);
        }
      } catch {
        // Non-blocking lease release
      }
      setLoadingMore(false);
      setIsContinuingDeep(false);
    }
  }

  async function handleLoadMore() {
    await handleContinueRetrieval("next_page");
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

  // Apply In-Memory Filtering and Sorting Pipeline (Zero API Calls)
  const visibleItems = useMemo(() => {
    if (!resolution?.items) return [];

    // Base items from dedicated local search result if available, else catalog items
    let list = localSearchResult ? [...localSearchResult.items] : [...resolution.items];

    // Filter by specific period if selected in CatalogFetchHistoryPanel
    if (activePeriodFilter) {
      list = list.filter((it) => it.provenance?.dateWindowId === activePeriodFilter);
    }

    // Year Filter from Intelligence Overview
    if (activeYearFilter !== null) {
      list = list.filter((it) => {
        if (!it.createdAt) return false;
        const yr = new Date(it.createdAt).getUTCFullYear();
        return yr === activeYearFilter;
      });
    }

    // Fallback in-memory filters if local search result is not yet initialized
    if (!localSearchResult) {
      if (localFilters.titleSearch.trim()) {
        const tq = localFilters.titleSearch.trim().toLowerCase();
        list = list.filter((it) => (it.title || "").toLowerCase().includes(tq));
      }
      if (localFilters.year !== null) {
        list = list.filter((it) => {
          if (!it.createdAt) return false;
          const yr = new Date(it.createdAt).getUTCFullYear();
          return yr === localFilters.year;
        });
      }
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
    }

    return list;
  }, [resolution?.items, localSearchResult, activePeriodFilter, activeYearFilter, localFilters]);

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

      {/* 1. Catalog Retrieval Strategy Panel (User-Controlled Periods & Direction) */}
      <CatalogRetrievalStrategyPanel
        strategy={retrievalStrategy}
        direction={retrievalDirection}
        customRangeConfig={customRangeConfig}
        onChangeStrategy={(nextStrat) => {
          setRetrievalStrategy(nextStrat);
          setScanConfig((prev) => ({ ...prev, retrievalStrategy: nextStrat }));
        }}
        onChangeDirection={(nextDir) => {
          setRetrievalDirection(nextDir);
          setScanConfig((prev) => ({ ...prev, retrievalDirection: nextDir }));
        }}
        onChangeCustomRange={(nextRange) => {
          setCustomRangeConfig(nextRange);
          setScanConfig((prev) => ({ ...prev, customRangeConfig: nextRange }));
        }}
        disabled={loading || loadingMore}
      />

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

          {/* DEDICATED ZERO-API LOCAL CATALOG SEARCH BAR */}
          {resolution.items.length > 0 && (
            <LocalCatalogSearchBar
              items={resolution.items}
              onFilteredItemsChange={(res) => setLocalSearchResult(res)}
              availableYears={availableYears}
              isCrawling={loading || loadingMore}
            />
          )}

          {/* HISTORICAL FETCH CHECKPOINT TIMELINE & PERIOD RESUME PANEL */}
          {resolution.retrievalLedger && (
            <CatalogFetchHistoryPanel
              ledger={resolution.retrievalLedger}
              targetLabel={resolution.analyzed.identifier}
              onSelectPeriodToResume={(period) => void handleContinueRetrieval("specific_period", period)}
              onFilterByPeriod={(periodId) => setActivePeriodFilter(periodId)}
              activePeriodFilter={activePeriodFilter}
              disabled={loading || loadingMore}
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
              isPartiallyFetched={Boolean(
                resolution.hasMore ||
                (resolution.lifetimeTotal && resolution.items.length < resolution.lifetimeTotal) ||
                resolution.intelligence?.statistics.coverageStatus === "standard_scan_completed" ||
                resolution.intelligence?.statistics.coverageStatus === "partial" ||
                resolution.intelligence?.statistics.coverageStatus === "capped_window"
              )}
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

              {/* Load More Pagination & Retrieval Status for Multi-Page Catalogs */}
              <div className="flex flex-col items-center justify-center gap-3 pt-6 pb-2">
                {/* Showing X of Y available references */}
                <div className="text-xs text-muted-foreground font-medium flex flex-wrap items-center justify-center gap-2">
                  <span>
                    Showing {visibleItems.length} of{" "}
                    {resolution.total !== null && resolution.total !== undefined
                      ? `${resolution.total.toLocaleString()} available references`
                      : "unreported provider total"}
                  </span>
                  {resolution.duplicatesSkipped !== undefined && resolution.duplicatesSkipped > 0 && (
                    <span className="text-[11px] text-muted-foreground/75">
                      ({resolution.duplicatesSkipped} duplicates skipped)
                    </span>
                  )}
                  {resolution.omittedOrUnavailableReferences !== undefined &&
                    resolution.omittedOrUnavailableReferences > 0 && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                        ({resolution.omittedOrUnavailableReferences} deleted/unavailable references omitted by provider)
                      </span>
                    )}
                </div>

                {/* Last appended notification toast */}
                {lastAppendedToast && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in zoom-in-95 duration-200">
                    <Check className="h-3.5 w-3.5" />
                    {lastAppendedToast}
                  </div>
                )}

                {/* Dedicated Catalog Retrieval Progress & Continuation Actions (2026) */}
                {(() => {
                  const lifetimeTotal =
                    resolution.lifetimeTotal ??
                    resolution.intelligence?.statistics.providerReportedVideos ??
                    null;
                  const hasRemainingCatalog = Boolean(lifetimeTotal && lifetimeTotal > resolution.items.length);
                  const remainingCount = lifetimeTotal ? Math.max(0, lifetimeTotal - resolution.items.length) : 0;
                  const coverageRatio =
                    lifetimeTotal && lifetimeTotal > 0
                      ? Math.min(100, Math.round((resolution.items.length / lifetimeTotal) * 1000) / 10)
                      : null;

                  const ledger = resolution.retrievalLedger;
                  const activePeriod =
                    resolution.currentPeriod ||
                    (ledger?.activePeriodId ? ledger.periods.find((p) => p.periodId === ledger.activePeriodId) : null) ||
                    ledger?.periods[0] ||
                    null;
                  const nextPeriod = ledger ? getNextPendingPeriod(ledger) : null;
                  const completedPeriodsCount = ledger ? ledger.periods.filter((p) => p.status === "completed").length : 0;
                  const pendingPeriodsCount = ledger ? ledger.periods.filter((p) => p.status === "pending" || p.status === "in_progress").length : 0;
                  const failedPeriodsCount = ledger ? ledger.periods.filter((p) => p.status === "failed").length : 0;
                  const isFullyCompleted = ledger ? isLedgerFullyCompleted(ledger) : !resolution.hasMore;

                  // Strategy label
                  const stratLabel =
                    retrievalStrategy === "month_by_month"
                      ? "Month by Month"
                      : retrievalStrategy === "year_by_year"
                      ? "Year by Year"
                      : retrievalStrategy === "custom_range"
                      ? "Custom Date Range"
                      : "Automatic Maximum Coverage (Default)";

                  const periodAdvanceButtonLabel =
                    retrievalStrategy === "month_by_month"
                      ? `Load Next Month${nextPeriod ? ` (${nextPeriod.label})` : ""}`
                      : retrievalStrategy === "year_by_year"
                      ? `Load Next Year${nextPeriod ? ` (${nextPeriod.label})` : ""}`
                      : `Load Next Period${nextPeriod ? ` (${nextPeriod.label})` : ""}`;

                  return (
                    <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-card/95 p-6 shadow-md space-y-5 text-center">
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                        <div className="flex items-center gap-2">
                          <Compass className="h-4 w-4 text-primary" />
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">
                            Catalog Retrieval Progress
                          </span>
                          <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-black text-primary uppercase">
                            {stratLabel}
                          </span>
                        </div>
                        {coverageRatio !== null && (
                          <span className="text-xs font-black text-amber-500">
                            {coverageRatio}% of reported reference count
                          </span>
                        )}
                      </div>

                      {/* Cumulative Numbers */}
                      <div className="space-y-1">
                        <div className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                          {resolution.items.length.toLocaleString()}{" "}
                          <span className="text-muted-foreground text-sm font-bold">/</span>{" "}
                          {lifetimeTotal ? `${lifetimeTotal.toLocaleString()} references retrieved` : "references retrieved"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {hasRemainingCatalog ? (
                            <span>
                              <strong className="text-amber-500">{remainingCount.toLocaleString()}</strong> additional references remain on Dailymotion across earlier dates.
                            </span>
                          ) : (
                            <span className="text-emerald-500 font-bold">
                              All accessible references retrieved within verified scope ({resolution.items.length.toLocaleString()} records loaded).
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Overall Progress Bar */}
                      {coverageRatio !== null && (
                        <div className="w-full bg-secondary/80 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={cn(
                              "h-2.5 rounded-full transition-all duration-300",
                              coverageRatio >= 100 ? "bg-emerald-500" : "bg-primary"
                            )}
                            style={{ width: `${Math.min(100, Math.max(2, coverageRatio))}%` }}
                          />
                        </div>
                      )}

                      {/* Active Period & Time-Partitioning Monitor Card */}
                      <div className="rounded-xl border border-border/70 bg-surface/80 p-4 text-left space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Active Period:
                              </span>
                              <span className="text-xs font-black text-foreground">
                                {activePeriod?.label || "Primary Discovery Window"}
                              </span>
                              {activePeriod?.status && (
                                <span
                                  className={cn(
                                    "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                    activePeriod.status === "completed" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                                    activePeriod.status === "in_progress" && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
                                    activePeriod.status === "capped" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
                                    activePeriod.status === "failed" && "bg-destructive/15 text-destructive border border-destructive/20",
                                    activePeriod.status === "pending" && "bg-surface-muted text-muted-foreground border border-border"
                                  )}
                                >
                                  {activePeriod.status}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              Range: {activePeriod?.startIso ? activePeriod.startIso.substring(0, 10) : "Start"} &rarr; {activePeriod?.endIso ? activePeriod.endIso.substring(0, 10) : "End"} (UTC)
                            </p>
                          </div>

                          <div className="text-right space-y-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                              Next Period:
                            </span>
                            <span className="text-xs font-bold text-foreground">
                              {nextPeriod ? nextPeriod.label : isFullyCompleted ? "All Periods Completed" : "Pending Evaluation"}
                            </span>
                          </div>
                        </div>

                        {/* Dual Metrics Grid: Current Period vs Total Catalog */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs pt-1">
                          <div className="rounded-lg bg-surface-muted/60 p-2 border border-border/50">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                              Period Pages
                            </span>
                            <span className="text-sm font-black text-foreground">
                              {activePeriod?.pagesFetched ?? currentPage}
                            </span>
                          </div>
                          <div className="rounded-lg bg-surface-muted/60 p-2 border border-border/50">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                              Raw Items
                            </span>
                            <span className="text-sm font-black text-foreground">
                              {resolution.totalRawObserved || resolution.items.length}
                            </span>
                          </div>
                          <div className="rounded-lg bg-surface-muted/60 p-2 border border-border/50">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                              Unique Items
                            </span>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                              {resolution.items.length}
                            </span>
                          </div>
                          <div className="rounded-lg bg-surface-muted/60 p-2 border border-border/50">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                              Duplicates Filtered
                            </span>
                            <span className="text-sm font-black text-amber-500">
                              {resolution.totalDuplicatesDetected || resolution.duplicatesSkipped || 0}
                            </span>
                          </div>
                        </div>

                        {/* Period Ledger Summary Bar */}
                        {ledger && ledger.periods.length > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                            <span>
                              Periods Progress: <strong className="text-foreground">{completedPeriodsCount}</strong> completed / <strong className="text-foreground">{ledger.periods.length}</strong> total
                            </span>
                            <span>
                              Pending: <strong className="text-foreground">{pendingPeriodsCount}</strong> · Direction: <strong className="text-primary">{retrievalDirection.replace(/_/g, " ")}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Capped Period Notice */}
                      {activePeriod?.isCapped && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 font-semibold text-left space-y-1">
                          <p className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <strong>Window Saturation Detected:</strong> {activePeriod.label} reached the provider 1,000-item query window limit.
                          </p>
                          <p className="text-[11px] opacity-90 pl-5">
                            Adaptive subdivision automatically partitioned this window into smaller child periods to guarantee 100% video discovery without dropping earlier records.
                          </p>
                        </div>
                      )}

                      {/* Continuation Actions Button Cluster */}
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        {/* 0. PROMINENT CONTINUE FETCHING (RESUME / DATE PARTITIONING) BUTTON */}
                        {(hasRemainingCatalog || (activePeriod?.hasMore ?? resolution.hasMore) || Boolean(nextPeriod)) && (
                          <button
                            type="button"
                            disabled={loadingMore && !isContinuingDeep}
                            onClick={() => {
                              if (isContinuingDeep) {
                                if (abortControllerRef.current) abortControllerRef.current.abort();
                                setIsContinuingDeep(false);
                              } else {
                                void handleContinueRetrieval("all_remaining");
                              }
                            }}
                            className={cn(
                              "inline-flex min-h-11 items-center gap-2.5 rounded-xl px-5 text-xs font-black transition-all cursor-pointer shadow-md shadow-emerald-950/20 ring-2",
                              isContinuingDeep
                                ? "bg-amber-600 text-white hover:bg-amber-700 ring-amber-500/50"
                                : "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white hover:opacity-95 ring-emerald-500/40"
                            )}
                            title="Resume catalog retrieval from the exact last checkpoint cutoff using backward date partitioning"
                          >
                            {isContinuingDeep ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Pause Fetching</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 fill-white" />
                                <span>Continue Fetching (Date Partitioning)</span>
                                {remainingCount > 0 && (
                                  <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white/95">
                                    +{remainingCount.toLocaleString()} remaining
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                        )}

                        {/* 1. LOAD NEXT PAGE (Within Current Date Window) */}
                        {(activePeriod?.hasMore ?? resolution.hasMore) && (
                          <button
                            type="button"
                            disabled={loadingMore}
                            onClick={() => void handleContinueRetrieval("next_page")}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-95 disabled:opacity-50 transition cursor-pointer shadow-xs"
                            title="Retrieve the next page within the current date window without moving to the next month or year"
                          >
                            {loadingMore && !isContinuingDeep ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Load Next Page
                          </button>
                        )}

                        {/* 2. LOAD NEXT PERIOD (Contextual: Load Next Month / Year / Period) */}
                        {nextPeriod && (
                          <button
                            type="button"
                            disabled={loadingMore}
                            onClick={() => void handleContinueRetrieval("next_period")}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/15 px-4 text-xs font-black text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition cursor-pointer shadow-xs"
                            title={`Step to the next time period according to the ${retrievalDirection} direction`}
                          >
                            {loadingMore && !isContinuingDeep ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                            {periodAdvanceButtonLabel}
                          </button>
                        )}

                        {/* 3. FETCH ALL REMAINING PERIODS */}
                        {(nextPeriod || (activePeriod?.hasMore ?? resolution.hasMore)) && (
                          <button
                            type="button"
                            disabled={loadingMore && !isContinuingDeep}
                            onClick={() => {
                              if (isContinuingDeep) {
                                if (abortControllerRef.current) abortControllerRef.current.abort();
                                setIsContinuingDeep(false);
                              } else {
                                void handleContinueRetrieval("all_remaining");
                              }
                            }}
                            className={cn(
                              "inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-black transition cursor-pointer shadow-xs",
                              isContinuingDeep
                                ? "bg-amber-600 text-white hover:bg-amber-700"
                                : "border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                            )}
                            title="Automatically traverse and retrieve all remaining time partitions in the selected scope"
                          >
                            {isContinuingDeep ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Pause Retrieval
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                Fetch All Remaining Periods
                              </>
                            )}
                          </button>
                        )}

                        {/* 4. RETRY FAILED PERIODS */}
                        {failedPeriodsCount > 0 && (
                          <button
                            type="button"
                            disabled={loadingMore}
                            onClick={() => void handleContinueRetrieval("retry_failed")}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/15 px-4 text-xs font-black text-destructive hover:bg-destructive/25 transition cursor-pointer shadow-xs"
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                            Retry Failed Periods ({failedPeriodsCount})
                          </button>
                        )}

                        {/* 5. FINALIZE CATALOG & COMMIT TO COMPLETED EXPLORATIONS */}
                        <button
                          type="button"
                          disabled={isSavingManifest || resolution.items.length === 0}
                          onClick={() => void handleFinalizeCatalog()}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-secondary/80 px-4 text-xs font-black text-foreground hover:bg-secondary disabled:opacity-50 transition cursor-pointer"
                          title="Run final canonical deduplication, compute SHA-256 checksum, and save consolidated manifest into Completed Explorations"
                        >
                          {isSavingManifest ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : savedManifestNotice ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                          )}
                          {savedManifestNotice ? "Saved to Completed Explorations!" : "Finalize Catalog"}
                        </button>
                      </div>

                      {/* Error Banner */}
                      {loadMoreError && (
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{loadMoreError}</span>
                          <button
                            type="button"
                            onClick={() => void handleContinueRetrieval("next_page")}
                            className="ml-2 font-bold underline hover:opacity-80 cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
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
                      titleSearch: "",
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
