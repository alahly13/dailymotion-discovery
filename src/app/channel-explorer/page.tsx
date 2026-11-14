"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiHelperPanel } from "@/components/ai/ai-helper-panel";
import { ChannelCoveragePanel } from "@/components/channel-explorer/channel-coverage-panel";
import { ChannelFetchConfigPanel } from "@/components/channel-explorer/channel-fetch-config-panel";
import { ChannelFetchHistoryPanel } from "@/components/channel-explorer/channel-fetch-history-panel";
import { ChannelFetchProgress } from "@/components/channel-explorer/channel-fetch-progress";
import { ChannelInputPanel } from "@/components/channel-explorer/channel-input-panel";
import { ChannelManifestSearchPanel, type ChannelExplorerSearchScope } from "@/components/channel-explorer/channel-manifest-search-panel";
import { ChannelManifestSummary } from "@/components/channel-explorer/channel-manifest-summary";
import { ChannelMetadataPanel } from "@/components/channel-explorer/channel-metadata-panel";
import { ChannelWindowFeedbackPanel } from "@/components/channel-explorer/channel-window-feedback-panel";
import { ActiveFilterChips } from "@/components/filters/active-filter-chips";
import { AdvancedFilterPanel } from "@/components/filters/advanced-filter-panel";
import { VideoResultsGrid } from "@/components/video/video-results-grid";
import { applyAdvancedVideoFilters } from "@/lib/filters/apply-advanced-video-filters";
import { defaultAdvancedVideoFilters } from "@/lib/filters/filter-types";
import { buildVideoSearchIndex, searchVideoIndex } from "@/lib/search/video-flexsearch";
import type { ChannelCoverage, ChannelCoverageResponse, ChannelFetchJobSnapshot, ChannelFetchSettings, ChannelFetchStartResponse, ChannelHistoryResponse, ChannelManifestResponse, ChannelMetadataResponse, ChannelPersistenceMode, ChannelSourceMetadata, FetchHistoryEntry, FetchSafetyCaps } from "@/types/channel-fetch";
import type { AdvancedVideoFilters } from "@/types/filters";
import type { ChannelManifest } from "@/types/manifest";
import type { ManifestResultViewMode, NormalizedVideoMetadata } from "@/types/video";

const defaultFetchSettings: ChannelFetchSettings = {
  fetchProfile: "deep-balanced",
  maxItems: 100000,
  maxTotalPages: 5000,
  maxWindows: 3000,
  pageSize: 100,
  fromDate: null,
  toDate: null,
  initialWindowUnit: "year",
  minimumSplitUnit: "month",
  autoSplitCappedWindows: true,
  concurrency: 3,
  delayMs: 250,
  stopWhenMaxItemsReached: true,
  stopOnCappedWindow: false,
  preservePartialManifest: true,
  resumeJobId: null,
  continueFromLatest: null,
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function mergeManifestItems(existing: ChannelManifest | null, incoming: ChannelManifest | null): ChannelManifest | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = new Map<string, NormalizedVideoMetadata>();
  for (const item of existing.items) merged.set(item.id, item);
  for (const item of incoming.items) merged.set(item.id, item);
  return {
    ...incoming,
    id: existing.id,
    manifestScope: "combined",
    attemptNumber: null,
    items: [...merged.values()],
    updatedAt: new Date().toISOString(),
  };
}

function asCombinedManifest(manifest: ChannelManifest): ChannelManifest {
  // Active jobs stream attempt-scoped items before the saved source catalog is
  // reloaded from the database. This client projection keeps Combined Results
  // coherent between chunks while preserving the first attempt number shown on
  // each result card.
  return {
    ...manifest,
    manifestScope: "combined",
    attemptNumber: null,
    items: manifest.items.map((item) => ({
      ...item,
      collectionProvenance: item.collectionProvenance
        ? {
            ...item.collectionProvenance,
            manifestScope: "combined",
            manifestLabel: "Combined Manifest",
          }
        : item.collectionProvenance,
    })),
  };
}

export default function ChannelExplorerPage() {
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ChannelSourceMetadata | null>(null);
  const [combinedManifest, setCombinedManifest] = useState<ChannelManifest | null>(null);
  const [currentAttemptManifest, setCurrentAttemptManifest] = useState<ChannelManifest | null>(null);
  const [activeJob, setActiveJob] = useState<ChannelFetchJobSnapshot | null>(null);
  const [coverage, setCoverage] = useState<ChannelCoverage | null>(null);
  const [history, setHistory] = useState<FetchHistoryEntry[]>([]);
  const [persistenceMode, setPersistenceMode] = useState<ChannelPersistenceMode>("runtime-memory");
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [safetyCaps, setSafetyCaps] = useState<FetchSafetyCaps | null>(null);
  const [fetchSettings, setFetchSettings] = useState<ChannelFetchSettings>(defaultFetchSettings);
  const [filters, setFilters] = useState<AdvancedVideoFilters>(defaultAdvancedVideoFilters);
  const [resultViewMode, setResultViewMode] = useState<ManifestResultViewMode>("combined");
  const [manifestSearchQuery, setManifestSearchQuery] = useState("");
  const [manifestSearchScope, setManifestSearchScope] = useState<ChannelExplorerSearchScope>("current");
  const [manifestSearchExactPhrase, setManifestSearchExactPhrase] = useState(false);
  const [manifestSearchFuzzy, setManifestSearchFuzzy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source") || params.get("channel") || params.get("c");
    const resumeJobId = params.get("resumeJobId");
    if (!source && !resumeJobId) return;

    // Saved channel pages can hand a source and optional resumable job back to
    // the explorer. Deferring via microtask preserves async React 19 mount flow
    // and only pre-fills local controls until the user analyzes or fetches.
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (source) setInput((current) => current || source);
      if (resumeJobId) setFetchSettings((current) => ({ ...current, resumeJobId }));
    });
    return () => {
      active = false;
    };
  }, []);

  const effectiveFetchSettings = useMemo(() => {
    if (!safetyCaps) return fetchSettings;
    return {
      ...fetchSettings,
      // Mirror backend concurrency caps in derived UI settings while keeping the
      // server route handler authoritative.
      concurrency: Math.min(Math.max(fetchSettings.concurrency ?? safetyCaps.defaultConcurrency, 1), safetyCaps.maxConcurrency),
    };
  }, [fetchSettings, safetyCaps]);

  const selectedManifest = useMemo(() => {
    if (manifestSearchScope === "combined") return combinedManifest ?? currentAttemptManifest;
    if (manifestSearchScope === "attempt") return currentAttemptManifest ?? combinedManifest;
    return currentAttemptManifest ?? combinedManifest;
  }, [combinedManifest, currentAttemptManifest, manifestSearchScope]);
  const selectedManifestItems = useMemo(() => selectedManifest?.items ?? [], [selectedManifest]);
  const aiManifestSummary = useMemo(() => {
    if (!selectedManifest || selectedManifestItems.length === 0) return null;
    return {
      source: metadata?.displayName ?? selectedManifest.resolvedChannelName ?? selectedManifest.sourceInput ?? input,
      totalCollected: selectedManifestItems.length,
      sample: selectedManifestItems.slice(0, 35).map((item) => ({
        id: item.id,
        title: item.title,
        duration: item.duration,
        views: item.views,
        language: item.language,
        year: item.year,
        tags: item.tags.slice(0, 5),
      })),
    };
  }, [input, metadata?.displayName, selectedManifest, selectedManifestItems]);
  const manifestSearchIndex = useMemo(() => buildVideoSearchIndex(selectedManifestItems), [selectedManifestItems]);
  const searchedItems = useMemo(
    () => searchVideoIndex(manifestSearchIndex, manifestSearchQuery, { exactPhrase: manifestSearchExactPhrase, fuzzy: manifestSearchFuzzy, limit: 1000 }),
    [manifestSearchExactPhrase, manifestSearchFuzzy, manifestSearchIndex, manifestSearchQuery]
  );
  const filteredItems = useMemo(() => applyAdvancedVideoFilters(searchedItems, filters), [searchedItems, filters]);
  const groupedAttemptItems = useMemo(() => {
    const groups = new Map<number, NormalizedVideoMetadata[]>();
    for (const item of filteredItems) {
      const attemptNumber = item.collectionProvenance?.attemptNumber ?? selectedManifest?.attemptNumber ?? 0;
      groups.set(attemptNumber, [...(groups.get(attemptNumber) ?? []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [filteredItems, selectedManifest]);
  const searchSourceLabel = manifestSearchScope === "combined"
    ? "Combined saved manifest"
    : manifestSearchScope === "attempt"
      ? `Selected attempt${selectedManifest?.attemptNumber ? ` #${selectedManifest.attemptNumber}` : ""}`
      : "Current live results";

  function applyJobSnapshot(job: ChannelFetchJobSnapshot) {
    setActiveJob(job);
    setCurrentAttemptManifest(job.manifest);
    setCombinedManifest((current) => mergeManifestItems(current, asCombinedManifest(job.manifest)));
    setMetadata(job.metadata);
    setCoverage(job.coverage);
    setPersistenceMode(job.persistence);
    setPersistenceWarning(job.persistenceWarning ?? job.coverage.persistenceWarning ?? null);
  }

  async function refreshHistory(sourceInput = input) {
    if (!sourceInput.trim()) return;
    const response = await fetch(`/api/dailymotion/channel/history?input=${encodeURIComponent(sourceInput)}`, { cache: "no-store" });
    const data = await readJson<ChannelHistoryResponse>(response);
    if (data.ok) {
      setHistory(data.history);
      setPersistenceMode(data.persistence);
      setPersistenceWarning(data.persistenceWarning ?? data.history.find((entry) => entry.persistenceWarning)?.persistenceWarning ?? null);
    }
  }

  async function refreshCoverage(sourceInput = input) {
    if (!sourceInput.trim()) return;
    const response = await fetch(`/api/dailymotion/channel/coverage?input=${encodeURIComponent(sourceInput)}`, { cache: "no-store" });
    const data = await readJson<ChannelCoverageResponse>(response);
    if (data.ok) {
      setCoverage(data.coverage);
      setPersistenceMode(data.persistence);
      setPersistenceWarning(data.persistenceWarning ?? data.coverage?.persistenceWarning ?? null);
    }
  }

  async function refreshSavedManifest(sourceInput = input) {
    if (!sourceInput.trim()) return;
    const response = await fetch(`/api/dailymotion/channel/manifest?input=${encodeURIComponent(sourceInput)}`, { cache: "no-store" });
    const data = await readJson<ChannelManifestResponse>(response);
    if (data.ok) {
      if (data.manifest) setCombinedManifest(data.manifest);
      if (data.history.length > 0) setHistory(data.history);
      if (data.coverage) setCoverage(data.coverage);
      setPersistenceMode(data.persistence);
      setPersistenceWarning(data.persistenceWarning ?? data.coverage?.persistenceWarning ?? null);
    }
  }

  async function analyze() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/dailymotion/channel/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const data = await readJson<{ analysis?: { displayLabel: string; sourceType: string }; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Analyze failed.");
      if (data.analysis) setAnalysis(`${data.analysis.displayLabel} - ${data.analysis.sourceType}`);
      await refreshMetadata();
      await refreshHistory();
      await refreshCoverage();
      await refreshSavedManifest();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyze failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMetadata() {
    if (!input.trim()) return;
    const response = await fetch("/api/dailymotion/channel/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
    const data = await readJson<ChannelMetadataResponse>(response);
    if (data.safetyCaps) setSafetyCaps(data.safetyCaps);
    if (data.persistence) setPersistenceMode(data.persistence);
    setPersistenceWarning(data.persistenceWarning ?? data.metadata?.persistenceWarning ?? null);
    if (!response.ok && !data.metadata) throw new Error(data.error ?? "Metadata refresh failed.");
    if (data.metadata) setMetadata(data.metadata);
  }

  async function continueJob(jobId: string, controller: AbortController) {
    let latest: ChannelFetchJobSnapshot | null = null;

    // The browser orchestrates small route-handler chunks so long channel
    // fetches are resumable and less likely to hit Vercel request duration
    // limits. Result filters are not involved in this loop.
    while (!stopRequestedRef.current) {
      const response = await fetch("/api/dailymotion/channel/jobs/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
        signal: controller.signal,
      });
      const data = await readJson<{ ok: boolean; job?: ChannelFetchJobSnapshot; done?: boolean; error?: string }>(response);
      if (!response.ok || !data.ok || !data.job) throw new Error(data.error ?? "Fetch job failed.");
      latest = data.job;
      applyJobSnapshot(data.job);
      if (data.done || data.job.status !== "running") break;
    }

    return latest;
  }

  async function startFetch(resumeJobId: string | null = null, continueFromLatest = false) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    stopRequestedRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/dailymotion/channel/jobs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, requestId, settings: { ...effectiveFetchSettings, resumeJobId, continueFromLatest } }),
        signal: controller.signal,
      });
      const data = await readJson<ChannelFetchStartResponse>(response);
      if (data.safetyCaps) setSafetyCaps(data.safetyCaps);
      if (data.persistence) setPersistenceMode(data.persistence);
      setPersistenceWarning(data.persistenceWarning ?? data.job?.persistenceWarning ?? null);
      if (!response.ok || !data.ok || !data.job) throw new Error(data.error ?? "Unable to start fetch.");
      applyJobSnapshot(data.job);
      const latest = data.job.status === "running" ? await continueJob(data.job.id, controller) : data.job;
      if (latest) applyJobSnapshot(latest);
      await refreshHistory(input);
      await refreshCoverage(input);
      await refreshSavedManifest(input);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Fetch failed.");
    } finally {
      setLoading(false);
    }
  }

  async function stopFetching() {
    stopRequestedRef.current = true;
    abortRef.current?.abort();
    const jobId = activeJob?.id;
    setLoading(false);
    if (!jobId) {
      setCurrentAttemptManifest((current) => current ? { ...current, fetchStatus: "stopped", isPartial: true, isComplete: false, updatedAt: new Date().toISOString() } : current);
      return;
    }
    const response = await fetch("/api/dailymotion/channel/jobs/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
    const data = await readJson<{ ok: boolean; job?: ChannelFetchJobSnapshot; error?: string }>(response);
    if (data.ok && data.job) applyJobSnapshot(data.job);
    await refreshHistory(input);
    await refreshCoverage(input);
    await refreshSavedManifest(input);
  }

  function exportManifest(target: ChannelManifest | null, filename: string, format: "json" | "ndjson" = "json") {
    if (!target) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      source: target.sourceMetadata,
      manifest: {
        id: target.id,
        scope: target.manifestScope,
        attemptNumber: target.attemptNumber,
        status: target.fetchStatus,
        completenessStatus: target.completenessStatus,
        reportedTotal: target.totalKnownItems,
        pagesFetched: target.pagesFetched,
        windowsProcessed: target.totalWindowsProcessed,
        cappedWindowCount: target.cappedWindowCount,
        failedWindowCount: target.failedWindowCount,
        duplicateCount: target.duplicateCount,
      },
      coverage,
      attempts: history,
      videos: target.items,
    };
    const body = format === "ndjson"
      ? [
          JSON.stringify({ type: "manifest", ...payload, videos: undefined }),
          ...target.items.map((video) => JSON.stringify({ type: "video", video })),
        ].join("\n")
      : JSON.stringify(payload, null, 2);
    const blob = new Blob([body], { type: format === "ndjson" ? "application/x-ndjson" : "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const latestResumable = history.find((entry) => entry.resumable);
  const hasSavedAttempts = history.length > 0;
  const coverageComplete = coverage?.coverageStatus === "complete";
  const primaryFetchLabel = loading
    ? "Fetching..."
    : latestResumable
      ? "Resume Fetch"
      : hasSavedAttempts && !coverageComplete
        ? "Continue Fetch"
        : coverageComplete
          ? "Refresh / Re-check Channel"
          : "Start Fetch";
  const primaryFetchCopy = latestResumable
    ? `Resume Attempt #${latestResumable.attemptNumber} from the last checkpoint.`
    : hasSavedAttempts && !coverageComplete
      ? "Fetch Remaining continues from the latest saved checkpoint instead of starting over."
      : coverageComplete
        ? "Re-check this channel. More content is not guaranteed when coverage is complete."
        : "Begin collecting public metadata for this channel.";
  const runPrimaryFetch = () => {
    if (latestResumable) return startFetch(latestResumable.id);
    return startFetch(null, hasSavedAttempts && !coverageComplete);
  };
  const summaryStats = [
    ["Reported total", metadata?.reportedTotalFromApi ?? selectedManifest?.totalKnownItems ?? "Unknown"],
    ["Collected unique", coverage?.collectedUniqueVideos ?? combinedManifest?.items.length ?? currentAttemptManifest?.items.length ?? 0],
    ["Coverage", coverage?.coveragePercent !== null && coverage?.coveragePercent !== undefined ? `${coverage.coveragePercent.toFixed(2)}%` : coverage?.coverageStatus ?? "Unknown"],
    ["Current attempt", activeJob?.attemptNumber ? `#${activeJob.attemptNumber}` : history[0]?.attemptNumber ? `#${history[0].attemptNumber}` : "None"],
    ["Active workers", activeJob?.progress ? `${activeJob.progress.currentConcurrentWorkers}/${activeJob.progress.maxConcurrentWorkers}` : "0/1"],
    ["Resume", latestResumable || activeJob?.progress.resumable ? "Available" : "Unavailable"],
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)] sm:p-8">
        <div className="terminal-rule mb-6 h-1 w-32 rounded-full" aria-hidden="true" />
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Channel Explorer</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">Build a public Dailymotion metadata catalog.</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-[var(--muted-foreground)] sm:text-lg">
          Collect public channel metadata through explicit fetch profiles, track database checkpoints when persistence is enabled, preserve partial manifests, and filter only what has already been collected.
        </p>
        <Link href="/channels" className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-4 text-center text-sm font-bold transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-container-high)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
          Open saved channel history
        </Link>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] 2xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
        <div className="space-y-5">
          <ChannelInputPanel value={input} loading={loading} canStop={loading || activeJob?.status === "running"} onChange={setInput} onAnalyze={analyze} onStop={stopFetching} />
          {analysis ? <div className="rounded-lg border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-4 text-sm font-bold text-[var(--success)]">Detected: {analysis}</div> : null}
          {error ? <div className="rounded-lg border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] p-4 text-sm font-bold text-[var(--error)]">{error}</div> : null}
          <ChannelMetadataPanel metadata={metadata} coverage={coverage} loading={loading} persistence={persistenceMode} persistenceWarning={persistenceWarning} onRefresh={refreshMetadata} />
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 min-w-0 sm:grid-cols-2 md:grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
            {summaryStats.map(([label, value]) => (
              <div key={label} className="min-w-0 flex flex-col rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-3 hover:border-[var(--border-strong)] transition-colors break-words">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
                <p className="mt-1 break-words text-base font-black sm:text-lg">{value}</p>
              </div>
            ))}
          </div>
          <ChannelFetchConfigPanel settings={effectiveFetchSettings} safetyCaps={safetyCaps} loading={loading} primaryLabel={primaryFetchLabel} primaryCopy={primaryFetchCopy} hasSavedAttempts={hasSavedAttempts} onChange={setFetchSettings} onStart={runPrimaryFetch} onStartNew={() => startFetch(null, false)} onReset={() => setFetchSettings(defaultFetchSettings)} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <ChannelFetchProgress status={activeJob?.status ?? (loading ? "fetching" : selectedManifest?.fetchStatus ?? "idle")} pagesFetched={activeJob?.progress.pagesFetched ?? selectedManifest?.pagesFetched ?? 0} count={filteredItems.length} total={metadata?.reportedTotalFromApi ?? selectedManifest?.totalKnownItems ?? null} progress={activeJob?.progress ?? null} coverage={coverage} persistence={persistenceMode} persistenceWarning={persistenceWarning} />
        <ChannelWindowFeedbackPanel windows={activeJob?.windows ?? []} recentPageAttempts={activeJob?.recentPageAttempts ?? []} progress={activeJob?.progress ?? null} resumable={Boolean(latestResumable || activeJob?.progress.resumable)} onResume={runPrimaryFetch} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChannelFetchHistoryPanel history={history} activeJobId={activeJob?.id ?? null} loading={loading} persistence={persistenceMode} persistenceWarning={persistenceWarning} onResume={(jobId) => startFetch(jobId)} />
        <ChannelCoveragePanel coverage={coverage} persistence={persistenceMode} persistenceWarning={persistenceWarning} />
      </div>
      <ChannelManifestSummary manifest={selectedManifest} persistence={activeJob?.persistence ?? persistenceMode} />

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <ChannelManifestSearchPanel query={manifestSearchQuery} scope={manifestSearchScope} exactPhrase={manifestSearchExactPhrase} fuzzy={manifestSearchFuzzy} sourceCount={selectedManifestItems.length} matchedCount={searchedItems.length} filteredCount={filteredItems.length} sourceLabel={searchSourceLabel} onQueryChange={setManifestSearchQuery} onScopeChange={setManifestSearchScope} onExactPhraseChange={setManifestSearchExactPhrase} onFuzzyChange={setManifestSearchFuzzy} />
        <AdvancedFilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(defaultAdvancedVideoFilters)} />
      </div>
      <ActiveFilterChips
        filters={filters}
        onRemove={(key) =>
          setFilters((prev) => ({
            ...prev,
            [key]: defaultAdvancedVideoFilters[key],
          }))
        }
        onReset={() => setFilters(defaultAdvancedVideoFilters)}
      />
      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">Manifest Results</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Results render after local manifest search, then result filters, then the selected sort. No search or filter interaction calls Dailymotion.</p>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">{filteredItems.length} shown / {searchedItems.length} searched / {selectedManifest?.items.length ?? 0} collected</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {(["combined", "by-attempt", "current-attempt"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setResultViewMode(mode);
                if (mode === "combined") setManifestSearchScope("combined");
                if (mode === "current-attempt") setManifestSearchScope("attempt");
              }}
              className={`rounded-md border px-3 py-2 text-center text-sm font-bold transition ${resultViewMode === mode ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--foreground)]" : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:border-[var(--border-strong)]"}`}
            >
              View: {mode === "combined" ? "Combined Results" : mode === "by-attempt" ? "By Fetch Attempt" : "Current Attempt"}
            </button>
          ))}
        </div>
      </div>
      {resultViewMode === "by-attempt" ? (
        <div className="space-y-6">
          {groupedAttemptItems.map(([attemptNumber, items]) => {
            const entry = history.find((item) => item.attemptNumber === attemptNumber);
            return (
              <section key={attemptNumber} className="space-y-3">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
                  <h3 className="text-lg font-black">Attempt #{attemptNumber || "unknown"}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {entry ? `${entry.uniqueItemsCollected} videos added, ${entry.duplicateCount} duplicates skipped, ${entry.pagesFetched} pages, ${entry.windowsProcessed} windows, status ${entry.status}.` : `${items.length} videos in this attempt group.`}
                  </p>
                </div>
                <VideoResultsGrid items={items} resultViewMode={resultViewMode} />
              </section>
            );
          })}
        </div>
      ) : (
        <VideoResultsGrid items={filteredItems} resultViewMode={resultViewMode} />
      )}
      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
        <div>
          <h2 className="text-xl font-black">Export / Open Saved Channel Manifest</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            Exports use the manifest items already loaded in this page state. Opening the saved channel manifest reloads persisted metadata only; it does not start a Dailymotion fetch.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {metadata?.persistedSourceId ? (
            <Link href={`/channels/${metadata.persistedSourceId}`} className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-center text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]">
              View saved channel page
            </Link>
          ) : null}
          <button type="button" onClick={() => refreshSavedManifest()} className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-center text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]">Open saved channel manifest</button>
          <button type="button" onClick={() => exportManifest(combinedManifest ?? selectedManifest, "dailymotion-combined-manifest.json")} className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-center text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]">Export combined manifest</button>
          <button type="button" onClick={() => exportManifest(combinedManifest ?? selectedManifest, "dailymotion-combined-manifest.ndjson", "ndjson")} className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-center text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]">Export combined NDJSON</button>
          <button type="button" onClick={() => exportManifest(currentAttemptManifest, `dailymotion-attempt-${activeJob?.attemptNumber ?? "latest"}.json`)} className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-center text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]">Export selected attempt</button>
          <button type="button" onClick={() => exportManifest(currentAttemptManifest, `dailymotion-attempt-${activeJob?.attemptNumber ?? "latest"}.ndjson`, "ndjson")} className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-center text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]">Export selected attempt NDJSON</button>
        </div>
      </div>
      <AiHelperPanel
        manifestSummary={aiManifestSummary}
        onApplyFilters={(suggested) => setFilters((prev) => ({ ...prev, ...suggested }))}
      />
    </div>
  );
}
