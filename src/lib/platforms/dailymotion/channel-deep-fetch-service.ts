import { createChannelManifest, getVideoDedupeKey, platformVideoIdentityKey } from "@/lib/manifests/channel-manifest";
import {
  channelDatabasePersistenceMode,
  channelPersistenceUnavailableWarning,
  decorateCoverageFallback,
  getLatestPersistedChannelCoverage,
  getPersistedChannelFetchJob,
  getPersistedRuntimeJobData,
  getPersistedSourceContinuationState,
  listPersistedChannelFetchHistory,
  persistChannelFetchSnapshot,
} from "@/lib/repositories/channel-fetch-persistence";
import type {
  ChannelCoverage,
  ChannelFetchCompletenessStatus,
  ChannelFetchJobSnapshot,
  ChannelFetchSettings,
  ChannelPersistenceMode,
  ChannelSourceMetadata,
  CoverageConfidence,
  FetchHistoryEntry,
  FetchJobStatus,
  FetchPageAttemptSummary,
  FetchWindowSummary,
  TimeWindowUnit,
} from "@/types/channel-fetch";
import type { ChannelManifest } from "@/types/manifest";
import type { NormalizedVideoMetadata } from "@/types/video";
import { fetchDailymotionChannelPage } from "./dailymotion-client";
import { fetchDailymotionSourceMetadata } from "./channel-metadata-service";
import { resolveChannelFetchSettings } from "./channel-fetch-settings";
import { analyzeDailymotionChannelInput, type DailymotionChannelAnalysis } from "./dailymotion-url-analyzer";

const PROVIDER_WINDOW_ITEM_CAP = 1000;
const DEFAULT_HISTORY_LIMIT = 25;

type RuntimePersistence = ChannelPersistenceMode;

interface RuntimeFetchWindow extends FetchWindowSummary {
  pageStart: number;
}

interface RuntimeFetchJob {
  id: string;
  sourceKey: string;
  attemptNumber: number;
  analysis: DailymotionChannelAnalysis;
  settings: ChannelFetchSettings;
  metadata: ChannelSourceMetadata | null;
  status: FetchJobStatus;
  completenessStatus: ChannelFetchCompletenessStatus;
  items: NormalizedVideoMetadata[];
  seenVideoIds: Set<string>;
  sourceCollectedSeedCount: number;
  windows: RuntimeFetchWindow[];
  pageAttempts: FetchPageAttemptSummary[];
  currentWindowId: string | null;
  pagesFetched: number;
  windowsProcessed: number;
  duplicateCount: number;
  cappedWindowCount: number;
  failedWindowCount: number;
  lastWorkerCount: number;
  windowExecutionSequence: number;
  maxItemsReached: boolean;
  partialManifestPreserved: boolean;
  resumable: boolean;
  startedAt: string | null;
  completedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastError: string | null;
  lastSuccessfulCheckpoint: string | null;
}

const jobs = new Map<string, RuntimeFetchJob>();

function nowIso() {
  return new Date().toISOString();
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + hours);
  return next;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceKeyForAnalysis(analysis: DailymotionChannelAnalysis) {
  return `${analysis.sourceType}:${analysis.resolvedIdentifier}`.toLowerCase();
}

export function sourceKeyFromInput(input: string) {
  return sourceKeyForAnalysis(analyzeDailymotionChannelInput(input));
}

function dateAtUtcStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateAtUtcEnd(value: string) {
  return new Date(`${value}T23:59:59.000Z`);
}

function addUnit(date: Date, unit: Exclude<TimeWindowUnit, "all">) {
  const next = new Date(date);
  if (unit === "year") next.setUTCFullYear(next.getUTCFullYear() + 1);
  if (unit === "month") next.setUTCMonth(next.getUTCMonth() + 1);
  if (unit === "week") next.setUTCDate(next.getUTCDate() + 7);
  if (unit === "day") next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function nextSplitUnit(unit: TimeWindowUnit): Exclude<TimeWindowUnit, "all"> | null {
  if (unit === "year") return "month";
  if (unit === "month") return "week";
  if (unit === "week") return "day";
  return null;
}

function unitRank(unit: Exclude<TimeWindowUnit, "all">) {
  return { year: 0, month: 1, week: 2, day: 3 }[unit];
}

function providerMaxPage(pageSize: number) {
  return Math.max(1, Math.ceil(PROVIDER_WINDOW_ITEM_CAP / Math.max(pageSize, 1)));
}

function windowId() {
  return crypto.randomUUID();
}

function buildWindow(unit: TimeWindowUnit, depth: number, windowStart: string | null, windowEnd: string | null, parentWindowId: string | null = null): RuntimeFetchWindow {
  return {
    id: windowId(),
    parentWindowId,
    status: "pending",
    windowStart,
    windowEnd,
    unit,
    depth,
    pageStart: 1,
    nextPageToFetch: 1,
    pagesFetched: 0,
    itemsFound: 0,
    uniqueItemsAdded: 0,
    duplicateItemsFound: 0,
    reachedProviderCap: false,
    hasMoreAtEnd: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    executionOrder: null,
  };
}

function windowKey(window: Pick<RuntimeFetchWindow, "unit" | "windowStart" | "windowEnd">) {
  return `${window.unit}:${window.windowStart ?? "open"}:${window.windowEnd ?? "open"}`;
}

function resumeWindowFromContinuation(window: {
  unit: TimeWindowUnit;
  windowStart: string | null;
  windowEnd: string | null;
  depth: number;
  nextPageToFetch: number;
}) {
  const nextPage = Math.max(1, window.nextPageToFetch);
  return {
    ...buildWindow(window.unit, window.depth, window.windowStart, window.windowEnd),
    pageStart: nextPage,
    nextPageToFetch: nextPage,
  };
}

function dateWindowLabel(window: FetchWindowSummary | null) {
  if (!window) return null;
  if (!window.windowStart && !window.windowEnd) return "All available dates";
  return `${window.windowStart ?? "open"} -> ${window.windowEnd ?? "open"}`;
}

function parallelismState(job: Pick<RuntimeFetchJob, "settings" | "windows">) {
  const concurrency = job.settings.concurrency ?? 1;
  if (job.settings.fetchProfile === "quick-preview" || job.settings.fetchProfile === "standard-fetch") {
    return { enabled: false, reason: "Sequential preview and standard profiles keep one provider window active for simple resume checkpoints." };
  }

  if (job.settings.initialWindowUnit === "all") {
    return { enabled: false, reason: "Single result-window mode has no independent date windows to run in parallel." };
  }

  if (concurrency <= 1) {
    return { enabled: false, reason: "Window concurrency is set to 1, so pages are processed sequentially." };
  }

  if (job.windows.filter((window) => window.status === "pending" || window.status === "running").length <= 1) {
    return { enabled: false, reason: "Only one unfinished window is available, so this chunk stays sequential." };
  }

  return { enabled: true, reason: "Independent date windows can run concurrently; pages inside each window still run in order." };
}

function markWindowRunning(job: RuntimeFetchJob, window: RuntimeFetchWindow) {
  window.status = "running";
  window.startedAt ??= nowIso();
  if (!window.executionOrder) {
    job.windowExecutionSequence += 1;
    window.executionOrder = job.windowExecutionSequence;
  }
}

function generateWindows(settings: ChannelFetchSettings) {
  if (settings.initialWindowUnit === "all" || settings.fetchProfile === "quick-preview" || settings.fetchProfile === "standard-fetch") {
    return [buildWindow("all", 0, null, null)];
  }

  const unit = settings.initialWindowUnit as Exclude<TimeWindowUnit, "all">;
  const start = settings.fromDate ? dateAtUtcStart(settings.fromDate) : dateAtUtcStart("2005-01-01");
  const end = settings.toDate ? dateAtUtcEnd(settings.toDate) : new Date();
  const windows: RuntimeFetchWindow[] = [];
  let cursor = new Date(start);

  // Planned windows are deterministic, non-overlapping UTC ranges. Future DB
  // persistence should store these exact boundaries so resume can prove which
  // catalog slices completed, capped, or failed.
  while (cursor <= end && windows.length < settings.maxWindows) {
    const next = addUnit(cursor, unit);
    const windowEnd = new Date(Math.min(next.getTime() - 1000, end.getTime()));
    windows.push(buildWindow(unit, 0, cursor.toISOString(), windowEnd.toISOString()));
    cursor = next;
  }

  return windows.reverse();
}

function splitWindow(window: RuntimeFetchWindow, settings: ChannelFetchSettings, maxDepth: number) {
  const childUnit = nextSplitUnit(window.unit);
  if (!childUnit || !window.windowStart || !window.windowEnd) return [];
  if (window.depth + 1 > maxDepth) return [];
  if (unitRank(childUnit) > unitRank(settings.minimumSplitUnit)) return [];

  const start = new Date(window.windowStart);
  const end = new Date(window.windowEnd);
  const children: RuntimeFetchWindow[] = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const next = addUnit(cursor, childUnit);
    const childEnd = new Date(Math.min(next.getTime() - 1000, end.getTime()));
    children.push(buildWindow(childUnit, window.depth + 1, cursor.toISOString(), childEnd.toISOString(), window.id));
    cursor = next;
  }

  return children.reverse();
}

function requestWindowParams(window: RuntimeFetchWindow) {
  const params: Record<string, number> = {};
  if (window.windowStart) params.created_after = Math.floor(new Date(window.windowStart).getTime() / 1000);
  if (window.windowEnd) params.created_before = Math.floor(new Date(window.windowEnd).getTime() / 1000);
  return params;
}

function mergeVideos(
  job: RuntimeFetchJob,
  videos: NormalizedVideoMetadata[],
  context: {
    window: RuntimeFetchWindow;
    pageAttemptId: string;
    pageNumber: number;
    collectedAt: string;
  }
) {
  let uniqueAdded = 0;
  let duplicates = 0;
  let processedVideos = 0;

  for (const video of videos) {
    if (job.items.length >= job.settings.maxItems && job.settings.stopWhenMaxItemsReached) break;
    processedVideos += 1;
    const dedupeKey = getVideoDedupeKey(video);
    if (job.seenVideoIds.has(dedupeKey)) {
      duplicates += 1;
      continue;
    }
    job.seenVideoIds.add(dedupeKey);
    job.items.push({
      ...video,
      collectionProvenance: {
        sourceId: null,
        sourceName: job.metadata?.displayName ?? job.metadata?.username ?? job.metadata?.handle ?? null,
        sourceHandle: job.metadata?.handle ?? job.metadata?.username ?? null,
        sourceExternalId: job.metadata?.externalSourceId ?? job.analysis.resolvedIdentifier,
        manifestId: job.id,
        manifestLabel: `Attempt #${job.attemptNumber}`,
        manifestScope: "attempt",
        fetchJobId: job.id,
        attemptNumber: job.attemptNumber,
        fetchProfile: job.settings.fetchProfile,
        fetchStatus: job.status,
        fetchWindowId: context.window.id,
        pageAttemptId: context.pageAttemptId,
        pageNumber: context.pageNumber,
        windowStart: context.window.windowStart,
        windowEnd: context.window.windowEnd,
        collectedAt: context.collectedAt,
        firstSeenInManifestAt: context.collectedAt,
        duplicateStatus: "new_in_attempt",
      },
    });
    uniqueAdded += 1;
    if (job.items.length >= job.settings.maxItems && job.settings.stopWhenMaxItemsReached) break;
  }

  job.duplicateCount += duplicates;

  return {
    uniqueAdded,
    duplicates,
    reachedAttemptItemLimit: job.items.length >= job.settings.maxItems && job.settings.stopWhenMaxItemsReached,
    stoppedBeforePageEnd: processedVideos < videos.length,
  };
}

function terminalStatus(status: FetchJobStatus) {
  return ["complete", "capped", "stopped", "failed", "max_items_reached", "timeout_limited", "provider_limited", "auth_or_provider_limited"].includes(status);
}

function calculateCompleteness(job: RuntimeFetchJob): ChannelFetchCompletenessStatus {
  if (job.status === "stopped") return "stopped";
  if (job.status === "failed") return "failed";
  if (job.status === "max_items_reached" || job.maxItemsReached) return "max_items_reached";
  if (job.status === "timeout_limited") return "timeout_limited";
  if (job.status === "provider_limited") return "provider_limited";
  if (job.status === "auth_or_provider_limited") return "auth_or_provider_limited";
  if (job.cappedWindowCount > 0) return "capped";
  if (job.failedWindowCount > 0) return "partial";
  if (job.windows.some((window) => window.status === "stopped" || window.status === "failed")) return "partial";
  if (job.windows.some((window) => window.status === "pending" || window.status === "running")) return "partial";
  if (job.windows.length > 0 && job.windows.every((window) => window.status === "complete" || window.status === "split")) return "complete";
  return "unknown";
}

function coverageConfidence(status: ChannelFetchCompletenessStatus, reportedTotal: number | null, collected: number): CoverageConfidence {
  if (status === "complete" && reportedTotal !== null && collected >= reportedTotal) return "high";
  if (status === "complete") return "medium";
  if (status === "partial" || status === "capped") return "low";
  return "unknown";
}

function buildCoverage(job: RuntimeFetchJob): ChannelCoverage {
  const reportedTotal = job.metadata?.reportedTotalFromApi ?? null;
  const collected = job.sourceCollectedSeedCount + job.items.length;
  const estimatedRemaining = reportedTotal !== null ? Math.max(reportedTotal - collected, 0) : null;
  const coveragePercent = reportedTotal && reportedTotal > 0 ? Math.min(100, Number(((collected / reportedTotal) * 100).toFixed(2))) : null;
  const pendingWindowCount = job.windows.filter((window) => window.status === "pending" || window.status === "running").length;
  const completedWindowCount = job.windows.filter((window) => window.status === "complete").length;
  const completenessStatus = calculateCompleteness(job);

  return {
    reportedTotalFromApi: reportedTotal,
    reportedTotalCheckedAt: job.metadata?.reportedTotalCheckedAt ?? null,
    collectedUniqueVideos: collected,
    estimatedRemainingVideos: estimatedRemaining,
    coveragePercent,
    coverageStatus: completenessStatus,
    coverageConfidence: coverageConfidence(completenessStatus, reportedTotal, collected),
    cappedWindowCount: job.cappedWindowCount,
    failedWindowCount: job.failedWindowCount,
    completedWindowCount,
    pendingWindowCount,
    latestSuccessfulCheckpoint: job.lastSuccessfulCheckpoint,
    lastResumePoint: job.currentWindowId,
    warning:
      completenessStatus === "complete"
        ? null
        : "Full channel coverage is only confirmed when every planned time window completes without caps or failures.",
  };
}

function buildManifest(job: RuntimeFetchJob): ChannelManifest {
  const completenessStatus = calculateCompleteness(job);
  return createChannelManifest({
    sourceType: job.analysis.sourceType,
    sourceInput: job.analysis.sourceInput,
    resolvedChannelId: job.analysis.resolvedIdentifier,
    resolvedChannelName: job.metadata?.displayName ?? job.analysis.displayLabel,
    requestId: job.id,
    items: job.items,
    totalKnownItems: job.metadata?.reportedTotalFromApi ?? null,
    pagesFetched: job.pagesFetched,
    totalWindowsProcessed: job.windowsProcessed,
    cappedWindowCount: job.cappedWindowCount,
    failedWindowCount: job.failedWindowCount,
    duplicateCount: job.duplicateCount,
    completenessStatus,
    fetchSettings: job.settings,
    sourceMetadata: job.metadata,
    fetchJobId: job.id,
    manifestScope: "attempt",
    attemptNumber: job.attemptNumber,
    isComplete: completenessStatus === "complete",
    isPartial: completenessStatus !== "complete",
  });
}

function buildHistoryEntry(job: RuntimeFetchJob): FetchHistoryEntry {
  return {
    id: job.id,
    sourceKey: job.sourceKey,
    attemptNumber: job.attemptNumber,
    fetchProfile: job.settings.fetchProfile,
    status: job.status,
    completenessStatus: calculateCompleteness(job),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    stoppedAt: job.stoppedAt,
    updatedAt: job.updatedAt,
    manifestId: job.id,
    itemsCollected: job.items.length + job.duplicateCount,
    uniqueItemsCollected: job.items.length,
    duplicateCount: job.duplicateCount,
    pagesFetched: job.pagesFetched,
    windowsProcessed: job.windowsProcessed,
    cappedWindowCount: job.cappedWindowCount,
    failedWindowCount: job.failedWindowCount,
    resumable: job.resumable && terminalStatus(job.status) && job.status !== "complete",
    currentResumeCheckpoint: job.lastSuccessfulCheckpoint ?? job.currentWindowId,
    persistence: "runtime-memory",
    persistenceType: "temporary",
  };
}

function buildProgress(job: RuntimeFetchJob) {
  const currentWindow = job.currentWindowId ? job.windows.find((window) => window.id === job.currentWindowId) ?? null : null;
  const activeWindows = job.windows.filter((window) => window.status === "running");
  const queuedWindowCount = job.windows.filter((window) => window.status === "pending").length;
  const parallelism = parallelismState(job);
  return {
    attemptNumber: job.attemptNumber,
    fetchProfile: job.settings.fetchProfile,
    status: job.status,
    completenessStatus: calculateCompleteness(job),
    pageSize: job.settings.pageSize,
    pagesFetched: job.pagesFetched,
    totalApiRequests: job.pageAttempts.length,
    currentPageNumber: currentWindow?.nextPageToFetch ?? null,
    currentDateWindow: dateWindowLabel(currentWindow),
    windowsProcessed: job.windowsProcessed,
    windowsQueued: queuedWindowCount + activeWindows.length,
    activeWindowCount: activeWindows.length,
    queuedWindowCount,
    windowsCompleted: job.windows.filter((window) => window.status === "complete").length,
    activeWindows,
    currentConcurrentWorkers: job.lastWorkerCount,
    maxConcurrentWorkers: job.settings.concurrency ?? 1,
    parallelismEnabled: parallelism.enabled,
    parallelismReason: parallelism.reason,
    itemsCollected: job.items.length + job.duplicateCount,
    uniqueItemsCollected: job.items.length,
    duplicateCount: job.duplicateCount,
    cappedWindowCount: job.cappedWindowCount,
    failedWindowCount: job.failedWindowCount,
    currentWindow,
    lastCheckpoint: job.lastSuccessfulCheckpoint,
    maxItemsReached: job.maxItemsReached,
    partialManifestPreserved: job.partialManifestPreserved,
    resumable: job.resumable,
  };
}

function snapshot(job: RuntimeFetchJob): ChannelFetchJobSnapshot {
  job.completenessStatus = calculateCompleteness(job);
  return {
    id: job.id,
    sourceKey: job.sourceKey,
    attemptNumber: job.attemptNumber,
    status: job.status,
    completenessStatus: job.completenessStatus,
    settings: job.settings,
    metadata: job.metadata,
    progress: buildProgress(job),
    coverage: buildCoverage(job),
    manifest: buildManifest(job),
    historyEntry: buildHistoryEntry(job),
    windows: job.windows,
    recentPageAttempts: job.pageAttempts.slice(-10),
    persistence: "runtime-memory",
    persistenceType: "temporary",
  };
}

function withPersistence(snapshot: ChannelFetchJobSnapshot, persistence: RuntimePersistence, warning: string | null = null): ChannelFetchJobSnapshot {
  return {
    ...snapshot,
    persistence,
    persistenceType: "temporary",
    persistenceWarning: warning,
    metadata: snapshot.metadata ? { ...snapshot.metadata, persistence, persistenceWarning: warning } : null,
    coverage: { ...snapshot.coverage, persistence, persistenceType: "temporary", persistenceWarning: warning },
    historyEntry: { ...snapshot.historyEntry, persistence, persistenceType: "temporary", persistenceWarning: warning },
  };
}

async function persistedSnapshot(job: RuntimeFetchJob) {
  const currentSnapshot = snapshot(job);
  if (channelDatabasePersistenceMode() !== "database") return currentSnapshot;

  try {
    await persistChannelFetchSnapshot(currentSnapshot);
    return withPersistence(currentSnapshot, "database");
  } catch (error) {
    return withPersistence(currentSnapshot, "runtime-memory", channelPersistenceUnavailableWarning(error));
  }
}

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (Date.parse(job.expiresAt) < now) jobs.delete(id);
  }
}

function finishJob(job: RuntimeFetchJob, status: FetchJobStatus) {
  job.status = status;
  job.completenessStatus = calculateCompleteness(job);
  job.completedAt = nowIso();
  job.updatedAt = job.completedAt;
  job.currentWindowId = null;
}

function maybeFinishWhenNoPending(job: RuntimeFetchJob) {
  if (job.maxItemsReached) {
    finishJob(job, "max_items_reached");
    return;
  }

  if (job.pagesFetched >= job.settings.maxTotalPages && job.windows.some((window) => window.status === "pending" || window.status === "running")) {
    finishJob(job, "partial");
    return;
  }

  const unfinished = job.windows.some((window) => window.status === "pending" || window.status === "running");
  if (!unfinished) {
    const stoppedOrFailedWindow = job.windows.some((window) => window.status === "stopped" || window.status === "failed");
    finishJob(job, job.cappedWindowCount > 0 ? "capped" : job.failedWindowCount > 0 || stoppedOrFailedWindow ? "partial" : "complete");
  }
}

function effectiveWindowConcurrency(job: RuntimeFetchJob) {
  const caps = resolveChannelFetchSettings(job.settings).caps;
  const requested = Math.min(Math.max(1, job.settings.concurrency ?? 1), caps.maxConcurrency);
  return parallelismState(job).enabled ? requested : 1;
}

function selectWindowsForChunk(job: RuntimeFetchJob, concurrency: number) {
  const remainingPages = Math.max(0, job.settings.maxTotalPages - job.pagesFetched);
  if (remainingPages <= 0) return [];

  const running = job.windows.filter((window) => window.status === "running");
  const selectedRunning = running.slice(0, Math.min(concurrency, remainingPages));
  const remainingWorkerSlots = Math.max(0, concurrency - selectedRunning.length);
  const remainingPageSlots = Math.max(0, remainingPages - selectedRunning.length);
  const remainingProcessableWindows = Math.max(0, job.settings.maxWindows - job.windowsProcessed - selectedRunning.length);
  const pendingSlots = Math.min(remainingWorkerSlots, remainingPageSlots, remainingProcessableWindows);
  const pending = job.windows.filter((window) => window.status === "pending").slice(0, pendingSlots);

  // This selector is the central safety valve for parallel deep fetch chunks:
  // it may choose multiple independent windows, but it never schedules two API
  // pages from the same window in one request, preserving page order and resume
  // checkpoints even when year/month windows are processed concurrently.
  return [...selectedRunning, ...pending];
}

async function processWindowPage(job: RuntimeFetchJob, window: RuntimeFetchWindow, signal?: AbortSignal) {
  markWindowRunning(job, window);

  const pageNumber = window.nextPageToFetch;
  const requestParams = requestWindowParams(window);
  const attempt: FetchPageAttemptSummary = {
    id: crypto.randomUUID(),
    fetchWindowId: window.id,
    pageNumber,
    limit: job.settings.pageSize,
    requestParams: { page: pageNumber, limit: job.settings.pageSize, ...requestParams },
    status: "success",
    itemsReturned: 0,
    uniqueItemsAdded: 0,
    duplicateItemsFound: 0,
    hasMore: false,
    requestedAt: nowIso(),
    completedAt: null,
  };

  const page = await fetchDailymotionChannelPage(job.analysis.apiPath, pageNumber, job.settings.pageSize, signal, requestParams);
  attempt.completedAt = nowIso();

  if (!page.ok || !page.data) {
    attempt.status = page.reason === "rate_limited" ? "rate_limited" : page.reason === "unauthorized" ? "auth_or_provider_limited" : "failed";
    window.status = "failed";
    window.errorMessage = page.error ?? "Dailymotion page request failed.";
    window.completedAt = nowIso();
    job.failedWindowCount += 1;
    job.lastError = window.errorMessage;
    job.status = page.reason === "unauthorized" ? "auth_or_provider_limited" : page.reason === "rate_limited" ? "provider_limited" : "failed";
    job.pageAttempts.push(attempt);
    job.updatedAt = nowIso();
    return;
  }

  attempt.itemsReturned = page.data.items.length;
  attempt.limit = page.data.limit;
  attempt.requestParams = { page: pageNumber, limit: page.data.limit, ...requestParams };
  attempt.hasMore = page.data.hasMore;
  const merge = mergeVideos(job, page.data.items, {
    window,
    pageAttemptId: attempt.id,
    pageNumber,
    collectedAt: attempt.completedAt ?? nowIso(),
  });
  attempt.uniqueItemsAdded = merge.uniqueAdded;
  attempt.duplicateItemsFound = merge.duplicates;
  job.pageAttempts.push(attempt);

  window.pagesFetched += 1;
  window.itemsFound += page.data.items.length;
  window.uniqueItemsAdded += merge.uniqueAdded;
  window.duplicateItemsFound += merge.duplicates;
  window.hasMoreAtEnd = page.data.hasMore;
  job.pagesFetched += 1;
  job.lastSuccessfulCheckpoint = `${window.id}:page:${pageNumber}`;

  const reachedAttemptItemLimit = merge.reachedAttemptItemLimit && (merge.stoppedBeforePageEnd || page.data.hasMore);
  if (reachedAttemptItemLimit) job.maxItemsReached = true;

  const reachedProviderCap = page.data.hasMore && (pageNumber >= providerMaxPage(job.settings.pageSize) || window.itemsFound >= PROVIDER_WINDOW_ITEM_CAP);
  const reachedJobCaps = job.maxItemsReached || (page.data.hasMore && job.pagesFetched >= job.settings.maxTotalPages);

  if (reachedProviderCap) {
    window.reachedProviderCap = true;
    const childWindows = job.settings.autoSplitCappedWindows ? splitWindow(window, job.settings, resolveChannelFetchSettings(job.settings).caps.maxWindowDepth) : [];
    if (childWindows.length > 0 && job.windows.length + childWindows.length <= job.settings.maxWindows) {
      window.status = "split";
      window.completedAt = nowIso();
      job.windowsProcessed += 1;
      job.windows.splice(job.windows.indexOf(window) + 1, 0, ...childWindows);
    } else {
      window.status = "capped";
      window.completedAt = nowIso();
      job.windowsProcessed += 1;
      job.cappedWindowCount += 1;
      if (job.settings.stopOnCappedWindow) finishJob(job, "capped");
    }
  } else if (page.data.hasMore && !reachedJobCaps) {
    window.nextPageToFetch = pageNumber + 1;
  } else if ((page.data.hasMore || merge.stoppedBeforePageEnd) && reachedJobCaps) {
    // This cursor is the contract between numbered attempts. When a fetch stops
    // because of user/job caps, the next "Fetch Remaining" attempt should pick
    // up the same source window at the next auditable API page instead of
    // replaying completed pages and counting duplicates as progress.
    window.nextPageToFetch = merge.stoppedBeforePageEnd ? pageNumber : pageNumber + 1;
    window.status = "stopped";
    window.completedAt = nowIso();
    job.windowsProcessed += 1;
    if (!job.maxItemsReached) finishJob(job, "partial");
  } else {
    window.status = "complete";
    window.completedAt = nowIso();
    job.windowsProcessed += 1;
  }

  if (job.maxItemsReached) finishJob(job, "max_items_reached");
}

export async function startChannelFetchJob(input: string, rawSettings: unknown, requestId?: string, signal?: AbortSignal) {
  cleanupExpiredJobs();
  const { settings, caps } = resolveChannelFetchSettings(rawSettings);

  if (settings.resumeJobId) {
    const existing = jobs.get(settings.resumeJobId);
    if (existing?.resumable) {
      existing.status = "running";
      existing.stoppedAt = null;
      existing.updatedAt = nowIso();
      return { job: await persistedSnapshot(existing), caps };
    }

    const persisted = await hydrateRuntimeJobFromDatabase(settings.resumeJobId);
    if (persisted?.resumable) {
      persisted.status = "running";
      persisted.stoppedAt = null;
      persisted.updatedAt = nowIso();
      jobs.set(persisted.id, persisted);
      return { job: await persistedSnapshot(persisted), caps };
    }

    throw new Error("Resume checkpoint was not found or is no longer resumable. Start a new fetch only if you want to collect from the beginning.");
  }

  const analysis = analyzeDailymotionChannelInput(input);
  const metadataResult = await fetchDailymotionSourceMetadata(analysis, signal);
  const metadata = metadataResult.metadata ?? null;
  const now = nowIso();
  const id = requestId ?? crypto.randomUUID();
  const sourceKey = sourceKeyForAnalysis(analysis);
  const continuationState = settings.continueFromLatest ? await getPersistedSourceContinuationState(sourceKey) : null;
  const completedWindowKeys = new Set(continuationState?.completedWindowKeys ?? []);
  const resumeWindows = (continuationState?.resumeWindows ?? []).map(resumeWindowFromContinuation);
  const resumeWindowKeys = new Set(resumeWindows.map(windowKey));
  const plannedWindows = generateWindows(settings)
    .filter((window) => !completedWindowKeys.has(windowKey(window)))
    .filter((window) => !resumeWindowKeys.has(windowKey(window)));
  const initialWindows = [...resumeWindows, ...plannedWindows]
    .slice(0, settings.maxWindows);
  const attemptNumber = await nextAttemptNumberForSource(sourceKey);
  const existingVideoIds = (continuationState?.existingVideoIds ?? [])
    .map((id) => platformVideoIdentityKey("dailymotion", id))
    .filter((id): id is string => Boolean(id));

  const job: RuntimeFetchJob = {
    id,
    sourceKey,
    attemptNumber,
    analysis,
    settings,
    metadata,
    status: "running",
    completenessStatus: "partial",
    items: [],
    seenVideoIds: new Set(existingVideoIds),
    sourceCollectedSeedCount: existingVideoIds.length,
    windows: initialWindows,
    pageAttempts: [],
    currentWindowId: null,
    pagesFetched: 0,
    windowsProcessed: 0,
    duplicateCount: 0,
    cappedWindowCount: 0,
    failedWindowCount: 0,
    lastWorkerCount: 0,
    windowExecutionSequence: 0,
    maxItemsReached: false,
    partialManifestPreserved: settings.preservePartialManifest,
    resumable: true,
    startedAt: now,
    completedAt: null,
    stoppedAt: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: addHours(new Date(), caps.jobTtlHours).toISOString(),
    lastError: metadataResult.ok ? null : metadataResult.error ?? "Metadata unavailable.",
    lastSuccessfulCheckpoint: null,
  };

  jobs.set(id, job);
  return { job: await persistedSnapshot(job), caps };
}

async function hydrateRuntimeJobFromDatabase(jobId: string): Promise<RuntimeFetchJob | null> {
  try {
    const persisted = await getPersistedRuntimeJobData(jobId);
    if (!persisted) return null;
    const jobRecord = persisted.job;
    const analysis = analyzeDailymotionChannelInput(jobRecord.sourceInput);
    const metadata = persisted.metadata;
    const items = persisted.items;
    const windows: RuntimeFetchWindow[] = persisted.windows.map((window) => ({ ...window, pageStart: 1 }));
    const startedWindows = windows
      .filter((window) => window.startedAt)
      .sort((a, b) => Date.parse(a.startedAt ?? "") - Date.parse(b.startedAt ?? ""));
    startedWindows.forEach((window, index) => {
      window.executionOrder ??= index + 1;
    });
    const windowExecutionSequence = Math.max(0, ...windows.map((window) => window.executionOrder ?? 0));
    const pageAttempts = persisted.pageAttempts;
    const coverage = persisted.snapshot.coverage;
    const settings = resolveChannelFetchSettings(persisted.settings).settings;

    // Hydration is the bridge that makes a database checkpoint executable again
    // after a page refresh, server restart, or Vercel redeploy. Only temporary
    // operational rows are loaded here; canonical videos/sources remain durable
    // database truth and are not deleted by this runtime map.
    return {
      id: jobRecord.id,
      sourceKey: sourceKeyForAnalysis(analysis),
      attemptNumber: persisted.snapshot.attemptNumber,
      analysis,
      settings,
      metadata,
      status: persisted.snapshot.status,
      completenessStatus: persisted.snapshot.completenessStatus,
      items,
      seenVideoIds: new Set(items.map(getVideoDedupeKey)),
      sourceCollectedSeedCount: Math.max(0, coverage.collectedUniqueVideos - items.length),
      windows,
      pageAttempts,
      currentWindowId: jobRecord.currentWindowId,
      pagesFetched: jobRecord.pagesFetched,
      windowsProcessed: jobRecord.windowsProcessed,
      duplicateCount: Number(jobRecord.duplicateCount),
      cappedWindowCount: jobRecord.cappedWindowCount,
      failedWindowCount: jobRecord.failedWindowCount,
      lastWorkerCount: Number(persisted.snapshot.progress.currentConcurrentWorkers ?? 0),
      windowExecutionSequence,
      maxItemsReached: persisted.snapshot.status === "max_items_reached",
      partialManifestPreserved: true,
      resumable: jobRecord.resumable,
      startedAt: jobRecord.startedAt?.toISOString() ?? null,
      completedAt: jobRecord.completedAt?.toISOString() ?? null,
      stoppedAt: jobRecord.stoppedAt?.toISOString() ?? null,
      createdAt: jobRecord.createdAt.toISOString(),
      updatedAt: jobRecord.updatedAt.toISOString(),
      expiresAt: jobRecord.expiresAt?.toISOString() ?? addHours(new Date(), getFetchTtlFallbackHours()).toISOString(),
      lastError: typeof jobRecord.errorJson === "object" && jobRecord.errorJson && "message" in jobRecord.errorJson ? String(jobRecord.errorJson.message) : null,
      lastSuccessfulCheckpoint: coverage.latestSuccessfulCheckpoint,
    };
  } catch {
    return null;
  }
}

function getFetchTtlFallbackHours() {
  return resolveChannelFetchSettings({}).caps.jobTtlHours;
}

async function nextAttemptNumberForSource(sourceKey: string) {
  const runtimeAttemptNumbers = [...jobs.values()]
    .filter((job) => job.sourceKey === sourceKey)
    .map((job) => job.attemptNumber);

  try {
    const persisted = await listPersistedChannelFetchHistory(sourceKey, 500);
    const persistedAttemptNumbers = persisted.map((entry) => entry.attemptNumber);
    return Math.max(0, ...runtimeAttemptNumbers, ...persistedAttemptNumbers) + 1;
  } catch {
    return Math.max(0, ...runtimeAttemptNumbers) + 1;
  }
}

export async function processNextChannelFetchChunk(jobId: string, signal?: AbortSignal) {
  cleanupExpiredJobs();
  const job = jobs.get(jobId) ?? (await hydrateRuntimeJobFromDatabase(jobId));
  if (!job) throw new Error("Fetch job was not found or has expired.");
  jobs.set(job.id, job);
  if (terminalStatus(job.status) && job.status !== "stopped" && job.status !== "failed" && job.status !== "partial") {
    return persistedSnapshot(job);
  }

  job.status = "running";
  job.updatedAt = nowIso();

  if (job.pagesFetched >= job.settings.maxTotalPages) {
    finishJob(job, "partial");
    return persistedSnapshot(job);
  }

  if (job.windowsProcessed >= job.settings.maxWindows && !job.windows.some((window) => window.status === "running")) {
    finishJob(job, "partial");
    return persistedSnapshot(job);
  }

  const concurrency = effectiveWindowConcurrency(job);
  const selectedWindows = selectWindowsForChunk(job, concurrency);
  job.lastWorkerCount = selectedWindows.length;
  job.currentWindowId = selectedWindows[0]?.id ?? null;

  if (selectedWindows.length === 0) {
    maybeFinishWhenNoPending(job);
    return persistedSnapshot(job);
  }

  // Each chunk is deliberately bounded by CHANNEL_FETCH_MAX_CONCURRENCY and
  // maxTotalPages. This gives yearly/monthly backfills real parallelism while
  // keeping Vercel route invocations short and resume-safe.
  await Promise.all(selectedWindows.map((window) => processWindowPage(job, window, signal)));

  if (!terminalStatus(job.status)) maybeFinishWhenNoPending(job);
  const stillActiveWindow = job.windows.find((window) => window.status === "running") ?? null;
  job.currentWindowId = terminalStatus(job.status) ? null : stillActiveWindow?.id ?? null;

  job.updatedAt = nowIso();
  if (!terminalStatus(job.status) && job.settings.delayMs > 0) await delay(job.settings.delayMs);
  return persistedSnapshot(job);
}

export async function stopChannelFetchJob(jobId: string) {
  cleanupExpiredJobs();
  const job = jobs.get(jobId) ?? (await hydrateRuntimeJobFromDatabase(jobId));
  if (!job) throw new Error("Fetch job was not found or has expired.");
  jobs.set(job.id, job);
  const now = nowIso();
  job.status = "stopped";
  job.stoppedAt = now;
  job.updatedAt = now;
  job.currentWindowId = null;
  job.lastWorkerCount = 0;
  // Parallel chunks may have more than one running window between browser
  // polls. Stopping re-queues all of them so Resume Fetch restarts from the
  // last persisted page cursor instead of treating in-flight windows as done.
  for (const runningWindow of job.windows.filter((window) => window.status === "running")) {
    runningWindow.status = "pending";
  }
  return persistedSnapshot(job);
}

export async function getChannelFetchJob(jobId: string) {
  cleanupExpiredJobs();
  const job = jobs.get(jobId);
  if (job) return persistedSnapshot(job);

  try {
    return await getPersistedChannelFetchJob(jobId);
  } catch {
    return null;
  }
}

export async function listChannelFetchHistory(sourceKey?: string, limit = DEFAULT_HISTORY_LIMIT): Promise<FetchHistoryEntry[]> {
  cleanupExpiredJobs();
  if (channelDatabasePersistenceMode() === "database") {
    try {
      return await listPersistedChannelFetchHistory(sourceKey, limit);
    } catch (error) {
      const warning = channelPersistenceUnavailableWarning(error);
      return [...jobs.values()]
        .filter((job) => !sourceKey || job.sourceKey === sourceKey)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit)
        .map((job) => ({ ...buildHistoryEntry(job), persistenceWarning: warning }));
    }
  }

  return [...jobs.values()]
    .filter((job) => !sourceKey || job.sourceKey === sourceKey)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
    .map(buildHistoryEntry);
}

export async function getLatestChannelCoverage(sourceKey: string): Promise<ChannelCoverage | null> {
  cleanupExpiredJobs();
  if (channelDatabasePersistenceMode() === "database") {
    try {
      return await getLatestPersistedChannelCoverage(sourceKey);
    } catch (error) {
      const warning = channelPersistenceUnavailableWarning(error);
      const latest = [...jobs.values()]
        .filter((job) => job.sourceKey === sourceKey)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      return decorateCoverageFallback(latest ? buildCoverage(latest) : null, warning);
    }
  }

  const latest = [...jobs.values()]
    .filter((job) => job.sourceKey === sourceKey)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  return latest ? buildCoverage(latest) : null;
}

export const runtimeFetchPersistence: RuntimePersistence = channelDatabasePersistenceMode();
