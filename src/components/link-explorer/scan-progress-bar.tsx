// Scan Progress Bar — Real-Time Catalog Crawl & Window Partitioning Monitor (2026)
//
// What this controls: Live progress tracking for Link Explorer discovery crawls, displaying
// active status pills, pages fetched, duplicates skipped, rate throttle status, active date window,
// and execution controls (Pause, Resume, Cancel).
// Scope: Link Explorer (/link-explorer).

"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  StopCircle,
  XCircle,
} from "lucide-react";
import type { ScanProgressState } from "@/lib/link-explorer/link-explorer-types";
import { cn } from "@/lib/utils/cn";

export interface ScanProgressBarProps {
  progress: ScanProgressState;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function ScanProgressBar({
  progress,
  isPaused,
  onPause,
  onResume,
  onCancel,
}: ScanProgressBarProps) {
  const isRunning =
    progress.status === "discovering" ||
    progress.status === "fetching_pages" ||
    progress.status === "splitting_date_ranges";

  const isFinished =
    progress.status === "completed" ||
    progress.status === "completed_with_known_limitations";

  const isFailed = progress.status === "failed";
  const isInterrupted = progress.status === "interrupted";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3 transition-all shadow-sm",
        isRunning && "border-primary/40 bg-primary/5",
        isFinished && "border-emerald-500/30 bg-emerald-500/5",
        isFailed && "border-rose-500/30 bg-rose-500/5",
        isInterrupted && "border-amber-500/30 bg-amber-500/5"
      )}
    >
      {/* Top row: Status pill & controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
          {isFinished && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
          {isFailed && <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />}
          {isInterrupted && <StopCircle className="h-4 w-4 text-amber-500 shrink-0" />}

          <span className="text-xs font-black uppercase tracking-wider text-foreground">
            {progress.status.replace(/_/g, " ")}
          </span>

          <span className="text-[11px] font-mono text-muted-foreground">
            {progress.strategy.toUpperCase()} SCAN
          </span>

          {progress.activeWindowLabel && (
            <span className="rounded bg-surface px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
              {progress.activeWindowLabel}
            </span>
          )}
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <>
              {isPaused ? (
                <button
                  type="button"
                  onClick={onResume}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                >
                  <Play className="h-3 w-3" />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPause}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-bold text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <Pause className="h-3 w-3" />
                  Pause
                </button>
              )}

              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <XCircle className="h-3 w-3" />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress Counters Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="rounded bg-surface p-2 border border-border/50">
          <span className="text-[10px] text-muted-foreground block font-sans">Pages Fetched</span>
          <span className="font-bold text-foreground">
            {progress.pagesFetched}
            {progress.totalPagesEstimated ? ` / ${progress.totalPagesEstimated}` : ""}
          </span>
        </div>
        <div className="rounded bg-surface p-2 border border-border/50">
          <span className="text-[10px] text-muted-foreground block font-sans">Unique Items</span>
          <span className="font-bold text-primary">{progress.uniqueItemsAdded}</span>
        </div>
        <div className="rounded bg-surface p-2 border border-border/50">
          <span className="text-[10px] text-muted-foreground block font-sans">Duplicates Skipped</span>
          <span className="font-bold text-muted-foreground">{progress.duplicateCount}</span>
        </div>
        <div className="rounded bg-surface p-2 border border-border/50">
          <span className="text-[10px] text-muted-foreground block font-sans">Throttle Delay</span>
          <span className="font-bold text-muted-foreground">{progress.currentRateThrottleMs}ms</span>
        </div>
      </div>

      {/* Animated Progress Bar */}
      {isRunning && (
        <div className="relative h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
          <div className="absolute inset-y-0 bg-primary animate-pulse w-full origin-left" />
        </div>
      )}

      {/* Error detail if present */}
      {progress.error && (
        <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 pt-1">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{progress.error}</span>
        </div>
      )}
    </div>
  );
}
