// Catalog Fetch History Panel — Historical Period Tracking & Checkpoint Timeline (2026)
//
// What this controls: Inspectable historical checkpoint timeline for date-partitioned catalog
// crawls. Displays each period (Year, Month, Custom) with its exact status (completed, in_progress,
// capped, pending, failed), unique records retrieved, pages committed, date bounds, and direct
// resumption actions (`[Resume Period]`, `[Start Period]`, `[Filter by Period]`).
// Why it exists: Fulfills the durable historical period tracking requirement, ensuring users
// can inspect past periods, resume incomplete ones, and never re-fetch completed periods.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Filter,
  History,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  CatalogPartitionLedger,
  RetrievalPeriod,
} from "@/lib/link-explorer/link-explorer-types";
import { cn } from "@/lib/utils/cn";

export interface CatalogFetchHistoryPanelProps {
  ledger: CatalogPartitionLedger;
  targetLabel: string;
  onSelectPeriodToResume: (period: RetrievalPeriod) => void;
  onFilterByPeriod?: (periodId: string | null) => void;
  activePeriodFilter?: string | null;
  disabled?: boolean;
}

export function CatalogFetchHistoryPanel({
  ledger,
  targetLabel,
  onSelectPeriodToResume,
  onFilterByPeriod,
  activePeriodFilter = null,
  disabled = false,
}: CatalogFetchHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "incomplete" | "completed">("all");

  const periods = ledger.periods || [];
  const completedCount = periods.filter((p) => p.status === "completed").length;
  const inProgressCount = periods.filter((p) => p.status === "in_progress").length;
  const cappedCount = periods.filter((p) => p.status === "capped").length;
  const pendingCount = periods.filter((p) => p.status === "pending").length;
  const failedCount = periods.filter((p) => p.status === "failed").length;

  const filteredPeriods = periods.filter((p) => {
    if (filterTab === "completed") return p.status === "completed";
    if (filterTab === "incomplete") return p.status !== "completed";
    return true;
  });

  return (
    <div className="w-full rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
      {/* Accordion Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-surface/40 hover:bg-surface/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-foreground">
                Fetch History & Date Checkpoints
              </h3>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                {ledger.strategy.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount} completed · {inProgressCount + cappedCount} active/capped · {pendingCount} pending across {periods.length} date partitions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cappedCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-500">
              <AlertCircle className="h-3 w-3" />
              {cappedCount} Subdivided
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-border/60 space-y-4 animate-in fade-in duration-200">
          {/* Target Identity & Filter Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Target: </span>
              <strong className="text-foreground">{targetLabel}</strong>
              <span className="text-muted-foreground ml-2">({ledger.apiVersion.toUpperCase()})</span>
            </div>

            {/* Segmented Filter Tabs */}
            <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-bold cursor-pointer transition-colors",
                  filterTab === "all" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All ({periods.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("incomplete")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-bold cursor-pointer transition-colors",
                  filterTab === "incomplete" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Incomplete ({periods.length - completedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("completed")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-bold cursor-pointer transition-colors",
                  filterTab === "completed" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Completed ({completedCount})
              </button>
            </div>
          </div>

          {/* Periods Timeline List */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredPeriods.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No periods match the selected filter tab.
              </p>
            ) : (
              filteredPeriods.map((period) => {
                const isActive = ledger.activePeriodId === period.periodId;
                const isFiltered = activePeriodFilter === period.periodId;

                return (
                  <div
                    key={period.periodId}
                    className={cn(
                      "rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all",
                      isActive
                        ? "border-primary/60 bg-primary/5 shadow-xs"
                        : "border-border/70 bg-surface/60 hover:bg-surface/90",
                      isFiltered && "ring-2 ring-primary/80"
                    )}
                  >
                    {/* Period Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-foreground">
                          {period.label}
                        </span>
                        {/* Status Badge */}
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            period.status === "completed" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
                            period.status === "in_progress" && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30",
                            period.status === "capped" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
                            period.status === "failed" && "bg-destructive/15 text-destructive border border-destructive/30",
                            period.status === "pending" && "bg-surface-muted text-muted-foreground border border-border"
                          )}
                        >
                          {period.status === "capped" ? "Capped (Subdivided)" : period.status}
                        </span>
                        {isActive && (
                          <span className="rounded-md bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px] font-black uppercase">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-mono">
                        <span>
                          {period.startIso ? period.startIso.substring(0, 10) : "Start"} &rarr;{" "}
                          {period.endIso ? period.endIso.substring(0, 10) : "End"}
                        </span>
                        <span>•</span>
                        <span>
                          Retained: <strong className="text-foreground">{period.uniqueItemsRetained.toLocaleString()}</strong> unique
                        </span>
                        <span>•</span>
                        <span>Pages: {period.pagesFetched}</span>
                        {period.duplicatesDetected > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-500">
                              {period.duplicatesDetected} dupes
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Period Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Filter by Period Action */}
                      {onFilterByPeriod && period.uniqueItemsRetained > 0 && (
                        <button
                          type="button"
                          onClick={() => onFilterByPeriod(isFiltered ? null : period.periodId)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold border transition cursor-pointer",
                            isFiltered
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border bg-card text-muted-foreground hover:text-foreground"
                          )}
                          title="Filter local catalog results to this period only"
                        >
                          <Filter className="h-3 w-3" />
                          {isFiltered ? "Filtered" : "Filter"}
                        </button>
                      )}

                      {/* Resume / Start Action */}
                      {period.status !== "completed" && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onSelectPeriodToResume(period)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition cursor-pointer shadow-2xs",
                            period.status === "pending"
                              ? "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                              : "bg-primary text-primary-foreground hover:opacity-90"
                          )}
                        >
                          {period.status === "pending" ? (
                            <>
                              <Play className="h-3 w-3" />
                              Start Period
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3" />
                              Resume Period
                            </>
                          )}
                        </button>
                      )}

                      {period.status === "completed" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
