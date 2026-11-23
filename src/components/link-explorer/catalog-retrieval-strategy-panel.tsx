// Catalog Retrieval Strategy Panel — User-Controlled Time-Partitioned Retrieval (2026)
//
// What this controls: Interactive selection of catalog partitioning strategy:
// A. Automatic Maximum Coverage (DEFAULT) — adaptive date-window partitioning to bypass 1,000-item limits
// B. Month by Month — step one calendar month at a time
// C. Year by Year — step one full calendar year at a time with automatic monthly sub-partitioning
// D. Custom Date Range — explicit date bounds with granular intervals (Entire, Yearly, Monthly, Weekly, Daily)
// Direction: Newest to Oldest (default) or Oldest to Newest.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useId } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  Clock,
  Compass,
  History,
  Info,
  Layers,
  Play,
  Sparkles,
  Zap,
} from "lucide-react";
import type {
  CustomDateRangeConfig,
  PeriodGranularity,
  RetrievalDirection,
  RetrievalStrategy,
} from "@/lib/link-explorer/link-explorer-types";
import {
  SELECTABLE_YEARS,
  getCalendarYearBoundaries,
} from "@/lib/link-explorer/catalog-partition-engine";
import type { DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import { cn } from "@/lib/utils/cn";

export interface CatalogRetrievalStrategyPanelProps {
  strategy: RetrievalStrategy;
  direction: RetrievalDirection;
  selectedYear?: number | null;
  customRangeConfig?: CustomDateRangeConfig;
  catalogTarget?: "videos" | "playlists";
  targetKind?: DailymotionResourceKind;
  onChangeStrategy: (strategy: RetrievalStrategy) => void;
  onChangeDirection: (direction: RetrievalDirection) => void;
  onSelectYear?: (year: number) => void;
  onFetchSelectedYear?: (year: number) => void;
  onChangeCustomRange: (config: CustomDateRangeConfig) => void;
  onChangeCatalogTarget?: (target: "videos" | "playlists") => void;
  disabled?: boolean;
}

const STRATEGY_OPTIONS: Array<{
  id: RetrievalStrategy;
  title: string;
  badge: string;
  isDefault?: boolean;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    id: "automatic_maximum_coverage",
    title: "Automatic Maximum Coverage",
    badge: "DEFAULT · MAXIMUM REACH",
    isDefault: true,
    description:
      "Automatically discovers catalog inception, partitions into time windows, fetches max page size (100), detects saturated 1,000-item caps, and adaptively subdivides into smaller periods.",
    icon: Sparkles,
  },
  {
    id: "month_by_month",
    title: "Month by Month",
    badge: "1 CALENDAR MONTH",
    description:
      "Retrieve the catalog one calendar month at a time (e.g. November 2026, October 2026). Control retrieval step-by-step with the Load Next Month action.",
    icon: CalendarDays,
  },
  {
    id: "year_by_year",
    title: "Year by Year",
    badge: "1 FULL YEAR",
    description:
      "Retrieve one full calendar year at a time (e.g. 2026, 2025). Automatically subdivides saturated years into 12 monthly windows if provider cap is hit.",
    icon: Calendar,
  },
  {
    id: "custom_range",
    title: "Custom Date Range",
    badge: "USER-SPECIFIED",
    description:
      "Specify exact start and end dates with custom granularity (Entire Range, Yearly, Monthly, Weekly, or Daily partitioning).",
    icon: CalendarRange,
  },
];

export function CatalogRetrievalStrategyPanel({
  strategy,
  direction,
  selectedYear,
  customRangeConfig,
  catalogTarget = "videos",
  targetKind,
  onChangeStrategy,
  onChangeDirection,
  onSelectYear,
  onFetchSelectedYear,
  onChangeCustomRange,
  onChangeCatalogTarget,
  disabled = false,
}: CatalogRetrievalStrategyPanelProps) {
  const panelId = useId();

  const isPlaylistMembership = targetKind === "playlist";
  const isPlaylistsCatalog = !isPlaylistMembership && catalogTarget === "playlists";

  const panelTitle = isPlaylistMembership
    ? "Playlist Membership (Complete Ingestion)"
    : isPlaylistsCatalog
    ? "Channel Playlist Catalog Discovery"
    : "Catalog Retrieval Strategy";

  const panelSubtitle = isPlaylistMembership
    ? "Retrieving all constituent playlist entries regardless of video upload date. Videos maintain their original upload dates."
    : isPlaylistsCatalog
    ? "Choose how the channel playlist catalog is divided into time periods based on playlist creation date (playlist.created_at)."
    : "Choose how the channel video catalog is divided into time periods based on video upload date (video.created_at).";

  const yearSelectorTitle = isPlaylistMembership
    ? "Playlist Membership — Complete Ingestion"
    : isPlaylistsCatalog
    ? "Playlist Creation Year Quick Selector (2010–2026)"
    : "Video Upload Year Quick Selector (2010–2026)";

  const yearSelectorSubtitle = isPlaylistMembership
    ? "Constituent videos retain their original upload dates. Membership ingestion retrieves all entries across all years without date truncation."
    : isPlaylistsCatalog
    ? "Select any calendar year to retrieve playlists created in that year based strictly on playlist.created_at."
    : "Select any calendar year to retrieve videos uploaded to Dailymotion in that year based strictly on video.created_at.";

  const domainBadge = isPlaylistMembership
    ? "Membership Domain (All Years)"
    : isPlaylistsCatalog
    ? "Playlist Creation Domain (playlist.created_at)"
    : "Video Upload Domain (video.created_at)";

  const activeYearBounds = selectedYear ? getCalendarYearBoundaries(selectedYear) : null;

  const startDateLabel = isPlaylistsCatalog
    ? "Playlist Creation Date — Fetch From (YYYY-MM-DD):"
    : "Video Upload Date — Fetch From (YYYY-MM-DD):";

  const endDateLabel = isPlaylistsCatalog
    ? "Playlist Creation Date — Fetch To (YYYY-MM-DD):"
    : "Video Upload Date — Fetch To (YYYY-MM-DD):";

  const handleStartDateChange = (val: string) => {
    onChangeCustomRange({
      startDate: val,
      endDate: customRangeConfig?.endDate || new Date().toISOString().substring(0, 10),
      granularity: customRangeConfig?.granularity || "month",
    });
  };

  const handleEndDateChange = (val: string) => {
    onChangeCustomRange({
      startDate: customRangeConfig?.startDate || "2005-01-01",
      endDate: val,
      granularity: customRangeConfig?.granularity || "month",
    });
  };

  const handleGranularityChange = (gran: PeriodGranularity) => {
    onChangeCustomRange({
      startDate: customRangeConfig?.startDate || "2005-01-01",
      endDate: customRangeConfig?.endDate || new Date().toISOString().substring(0, 10),
      granularity: gran,
    });
  };

  const isInvalidCustomRange = Boolean(
    strategy === "custom_range" &&
      customRangeConfig?.startDate &&
      customRangeConfig?.endDate &&
      customRangeConfig.startDate > customRangeConfig.endDate
  );

  return (
    <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-sm space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Compass className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight text-foreground flex items-center gap-2">
              {panelTitle}
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">
                Active: {strategy.replace(/_/g, " ")}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {panelSubtitle}
            </p>
          </div>
        </div>

        {/* Controls: Target Toggle & Direction Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {onChangeCatalogTarget && !isPlaylistMembership && (
            <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
              <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Target:
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChangeCatalogTarget("videos")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                  catalogTarget !== "playlists"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
                )}
              >
                Videos
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChangeCatalogTarget("playlists")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                  catalogTarget === "playlists"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
                )}
              >
                Playlists
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-1">
            <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Direction:
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChangeDirection("newest_to_oldest")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                direction === "newest_to_oldest"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
              )}
            >
              Newest to Oldest
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChangeDirection("oldest_to_newest")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                direction === "oldest_to_newest"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
              )}
            >
              Oldest to Newest
            </button>
          </div>
        </div>
      </div>

      {/* 1. Year Quick Selector (2010–2026) */}
      <div className="rounded-xl border border-border/80 bg-surface/40 p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                {yearSelectorTitle}
              </h4>
              <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                17 Years Inclusive (2010–2026)
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {yearSelectorSubtitle}
            </p>
          </div>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-muted border border-border/60 text-muted-foreground self-start sm:self-auto">
            {domainBadge}
          </span>
        </div>

        {/* 17 Selectable Year Buttons (2010 to 2026 inclusive) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {SELECTABLE_YEARS.map((yr) => {
            const isYearActive = strategy === "selected_year" && selectedYear === yr;
            const is2026 = yr === 2026;

            return (
              <button
                key={yr}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSelectYear?.(yr);
                  onChangeStrategy("selected_year");
                }}
                className={cn(
                  "relative px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer font-mono border",
                  isYearActive
                    ? "bg-primary text-primary-foreground border-primary shadow-xs ring-2 ring-primary/30"
                    : "bg-surface hover:bg-surface-muted text-muted-foreground hover:text-foreground border-border/70 hover:border-border"
                )}
                title={`Select calendar year ${yr} to retrieve all records`}
              >
                <span>{yr}</span>
                {is2026 && (
                  <span
                    className={cn(
                      "ml-1 text-[9px] px-1 py-0.2 rounded font-sans uppercase font-black",
                      isYearActive ? "bg-black/30 text-white" : "bg-primary/15 text-primary"
                    )}
                  >
                    Now
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Year Boundaries & Retrieval Trigger Card */}
        {strategy === "selected_year" && selectedYear && activeYearBounds && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary text-primary-foreground font-black text-xs px-2.5 py-0.5">
                    Year {selectedYear}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    Strict Half-Open Boundary:
                  </span>
                  <code className="text-[11px] font-mono bg-surface-muted/90 px-2 py-0.5 rounded border border-border text-foreground">
                    {activeYearBounds.boundaryLabel}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground font-mono">
                  <span>Start (UTC): {activeYearBounds.startIso}</span>
                  <span>•</span>
                  <span>End Limit: {activeYearBounds.nextYearStartIso}</span>
                  <span>•</span>
                  <span>Unix: {activeYearBounds.startUnix} &lt;= t &lt; {activeYearBounds.nextYearStartUnix}</span>
                </div>
                {selectedYear === 2026 && (
                  <p className="text-[11px] text-amber-500 font-medium">
                    Note: 2026 retrieval discovers all published items up to the current moment without fabricating unreleased records.
                  </p>
                )}
              </div>

              {onFetchSelectedYear && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onFetchSelectedYear(selectedYear)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground shadow-sm hover:bg-primary/90 transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Fetch Entire Year {selectedYear}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Strategy Card Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {STRATEGY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = strategy === opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChangeStrategy(opt.id)}
              className={cn(
                "relative flex flex-col text-left rounded-xl p-3.5 border transition-all cursor-pointer group",
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                  : "border-border/70 bg-surface/50 hover:bg-surface hover:border-border"
              )}
            >
              {/* Top row: Icon + Checkmark */}
              <div className="flex items-center justify-between w-full mb-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {isSelected && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>

              {/* Title & Badge */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                  {opt.badge}
                </span>
                <h4 className="text-xs font-bold text-foreground tracking-tight">
                  {opt.title}
                </h4>
              </div>

              {/* Description */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Custom Date Range Specific Inputs */}
      {strategy === "custom_range" && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              Custom Range Configuration
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Start Date */}
            <div className="space-y-1">
              <label htmlFor={`${panelId}-start`} className="text-[11px] font-bold text-muted-foreground">
                {startDateLabel}
              </label>
              <input
                id={`${panelId}-start`}
                type="date"
                value={customRangeConfig?.startDate || "2005-01-01"}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <label htmlFor={`${panelId}-end`} className="text-[11px] font-bold text-muted-foreground">
                {endDateLabel}
              </label>
              <input
                id={`${panelId}-end`}
                type="date"
                value={customRangeConfig?.endDate || new Date().toISOString().substring(0, 10)}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>

            {/* Granularity */}
            <div className="space-y-1">
              <label htmlFor={`${panelId}-granularity`} className="text-[11px] font-bold text-muted-foreground">
                Period Granularity:
              </label>
              <select
                id={`${panelId}-granularity`}
                value={customRangeConfig?.granularity || "month"}
                onChange={(e) => handleGranularityChange(e.target.value as PeriodGranularity)}
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
              >
                <option value="entire_range">Entire Selected Range (Single Window)</option>
                <option value="year">Yearly Partitioning</option>
                <option value="month">Monthly Partitioning</option>
                <option value="week">Weekly Partitioning</option>
                <option value="day">Daily Partitioning</option>
              </select>
            </div>
          </div>

          {isInvalidCustomRange && (
            <p className="text-xs text-destructive font-bold">
              Error: Start date must be earlier than or equal to End date.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
