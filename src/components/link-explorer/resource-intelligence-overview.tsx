// Resource Intelligence Overview — Dailymotion Channel, Playlist & Resource Intelligence Dashboard (2026)
//
// What this controls: Comprehensive analytical dashboard rendered immediately below the Link Explorer
// input. Displays profile metadata, verified target identity, provider vs local statistical counters,
// accurate coverage percentage (no false 100%), retrieval diagnostics breakdown with date windows,
// chronological landmarks (oldest video, newest video), and interactive year/month distribution graphs.
// Why it exists: Transforms Link Explorer from a basic single-page fetcher into a deep intelligence workspace.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  ExternalLink,
  Film,
  Globe2,
  History,
  Layers,
  Sparkles,
  TrendingUp,
  Tv,
  UsersRound,
} from "lucide-react";
import type { ResourceIntelligenceData } from "@/lib/link-explorer/link-explorer-types";
import { formatDuration } from "@/components/discovery/result-card";
import { cn } from "@/lib/utils/cn";
import { formatSafeDescription } from "@/lib/utils/format-description";

export interface ResourceIntelligenceOverviewProps {
  data: ResourceIntelligenceData;
  activeYearFilter: number | null;
  onSelectYearFilter: (year: number | null) => void;
}

export function ResourceIntelligenceOverview({
  data,
  activeYearFilter,
  onSelectYearFilter,
}: ResourceIntelligenceOverviewProps) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { profile, statistics, chronology, distribution, diagnostics } = data;
  const targetId = profile.targetIdentity;

  const handleCopyLink = () => {
    if (profile.canonicalUrl) {
      navigator.clipboard.writeText(profile.canonicalUrl).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isLongDescription = (profile.description || "").length > 180;

  // Format status badge label
  const statusLabels: Record<string, { label: string; color: string }> = {
    standard_scan_completed: {
      label: "Standard Scan Completed (Partial)",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    },
    more_results_available: {
      label: "More Results Available",
      color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30",
    },
    capped_window: {
      label: "Capped 1,000-Item Window",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    },
    date_partitioning_required: {
      label: "Date Partitioning Required",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    },
    complete_within_verified_scope: {
      label: "100% Verified Scope",
      color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    },
    completed_with_known_limitations: {
      label: "Completed With Known Limitations",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    },
    completed: {
      label: "Scan Completed",
      color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    },
    partial: {
      label: "Partial Catalog",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    },
    coverage_unknown: {
      label: "Coverage Unknown",
      color: "bg-neutral-500/15 text-neutral-400 border border-neutral-500/30",
    },
  };

  const currentStatusBadge =
    statusLabels[statistics.coverageStatus] ||
    statusLabels[profile.catalogStatus] || {
      label: profile.catalogStatus.replace(/_/g, " "),
      color: "bg-surface text-muted-foreground border border-border",
    };

  return (
    <div className="space-y-6">
      {/* 1. Main Profile & Resource Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

        <div className="flex flex-col md:flex-row items-start justify-between gap-6 relative z-10">
          {/* Avatar & Profile Identity */}
          <div className="flex items-start gap-4">
            <div className="relative h-16 w-16 md:h-20 md:w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-border bg-surface shadow-md">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-primary bg-primary/10">
                  <UsersRound className="h-8 w-8" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground">
                  {profile.name}
                </h2>
                {profile.verified && (
                  <span
                    className="inline-flex items-center text-sky-500"
                    title="Verified Channel"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wider",
                    profile.apiVersion === "v1"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
                  )}
                >
                  API {profile.apiVersion.toUpperCase()}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                    currentStatusBadge.color
                  )}
                >
                  {currentStatusBadge.label}
                </span>
              </div>

              {/* Verified Resource Identifiers Row */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
                {targetId?.legacyUserId ? (
                  <span className="font-semibold text-foreground/90">
                    Legacy User ID: {targetId.legacyUserId}
                  </span>
                ) : (
                  <span>ID: {profile.id}</span>
                )}
                {targetId?.legacyUsername && (
                  <span>Username: @{targetId.legacyUsername}</span>
                )}
                {targetId?.v2ProfileId && (
                  <span className="text-indigo-400 font-semibold">
                    V2 Profile ID: {targetId.v2ProfileId}
                  </span>
                )}
                {profile.country && (
                  <span className="flex items-center gap-1 font-sans">
                    <Globe2 className="h-3.5 w-3.5" />
                    {profile.country}
                  </span>
                )}
                {profile.createdDate && (
                  <span className="flex items-center gap-1 font-sans">
                    <Calendar className="h-3.5 w-3.5" />
                    {targetId?.resolvedKind === "playlist" ? "Playlist Created" : "Joined"} {new Date(profile.createdDate).toLocaleDateString()}
                  </span>
                )}
                {data.membershipDateNotice && (
                  <div className="w-full mt-2 rounded-lg bg-surface/70 border border-border/80 px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2 font-sans">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>{data.membershipDateNotice}</span>
                  </div>
                )}
              </div>

              {/* Bio / Description */}
              {profile.description && (
                <div className="pt-1 max-w-3xl">
                  <p
                    className={cn(
                      "text-xs text-muted-foreground leading-relaxed whitespace-pre-line",
                      !descriptionExpanded && isLongDescription && "line-clamp-2"
                    )}
                  >
                    {formatSafeDescription(profile.description)}
                  </p>
                  {isLongDescription && (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((prev) => !prev)}
                      className="mt-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      {descriptionExpanded ? "Show Less" : "Read Full Bio"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {profile.canonicalUrl && (
              <>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedLink ? "Copied" : "Copy URL"}
                </button>
                <a
                  href={profile.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open on Dailymotion
                </a>
              </>
            )}
            <Link
              href={`/channel-explorer?channel=${encodeURIComponent(targetId?.legacyUsername || profile.id)}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-xs"
            >
              <Compass className="h-3.5 w-3.5" />
              Channel Crawler
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Content Statistics Counters Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Provider Reported Total */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Provider Total
            </span>
            <Tv className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-foreground">
            {statistics.providerReportedVideos !== null
              ? statistics.providerReportedVideos.toLocaleString()
              : statistics.isGlobalTotalUnknown
              ? "Unknown"
              : "Unreported"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {statistics.providerReportedVideos !== null
              ? "Official lifetime catalog size reported by API"
              : "Global total unknown — date-window retrieval"}
          </p>
          {statistics.providerReportedQueryTotal !== null &&
            statistics.providerReportedQueryTotal !== statistics.providerReportedVideos && (
              <p className="text-[10px] text-muted-foreground font-mono">
                Query window: {statistics.providerReportedQueryTotal.toLocaleString()} items
              </p>
            )}
          {statistics.omittedOrUnavailableReferences !== undefined &&
            statistics.omittedOrUnavailableReferences > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                {statistics.omittedOrUnavailableReferences} deleted/unavailable references omitted by provider
              </p>
            )}
        </div>

        {/* Metric 2: Locally Retrieved Items */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Retrieved Items
            </span>
            <Film className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-black text-primary">
            {statistics.totalRetrieved.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Indexed into local memory & manifest
          </p>
          {statistics.pagesRetrieved !== undefined && (
            <p className="text-[10px] text-muted-foreground font-mono">
              Across {statistics.pagesRetrieved} page{statistics.pagesRetrieved > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Metric 3: Catalog Coverage */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Catalog Coverage
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p
            className={cn(
              "text-2xl font-black",
              statistics.coveragePercent === 100
                ? "text-emerald-500"
                : statistics.coveragePercent !== null
                ? "text-amber-500"
                : "text-muted-foreground"
            )}
          >
            {statistics.coveragePercent !== null
              ? `${statistics.coveragePercent}%`
              : "Unknown"}
          </p>
          <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                statistics.coveragePercent === 100 ? "bg-emerald-500" : "bg-amber-500"
              )}
              style={{ width: `${statistics.coveragePercent || 0}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground truncate" title={statistics.coverageEvidence}>
            {statistics.coverageEvidence ||
              (statistics.coveragePercent === 100
                ? "Verified complete scope"
                : "Partial catalog fetched")}
          </p>
        </div>

        {/* Metric 4: Resource Breakdown */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Resource Breakdown
            </span>
            <Layers className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2 pt-0.5">
            <span className="text-lg font-bold text-foreground">
              {statistics.locallyRetrievedVideos}
            </span>
            <span className="text-xs text-muted-foreground">videos</span>
            {statistics.locallyRetrievedPlaylists > 0 && (
              <>
                <span className="text-neutral-400">·</span>
                <span className="text-lg font-bold text-foreground">
                  {statistics.locallyRetrievedPlaylists}
                </span>
                <span className="text-xs text-muted-foreground">playlists</span>
              </>
            )}
            {statistics.locallyRetrievedLivestreams > 0 && (
              <>
                <span className="text-neutral-400">·</span>
                <span className="text-lg font-bold text-foreground">
                  {statistics.locallyRetrievedLivestreams}
                </span>
                <span className="text-xs text-muted-foreground">lives</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Deduplicated by composite identity
            {statistics.duplicatesSkipped !== undefined && statistics.duplicatesSkipped > 0 && (
              <span className="text-amber-500 font-semibold ml-1">
                ({statistics.duplicatesSkipped} duplicates skipped)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 2.5 Retrieval Diagnostics & Date Windows Expandable Panel (Section 7 Requirement) */}
      {diagnostics && diagnostics.windows && diagnostics.windows.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <button
            type="button"
            onClick={() => setDiagnosticsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between p-4 bg-surface/50 hover:bg-surface transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Retrieval Diagnostics & Date Windows ({diagnostics.windows.length} partition{diagnostics.windows.length > 1 ? "s" : ""})
              </h4>
              <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
                {diagnostics.scanStrategy.toUpperCase()} SCAN
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{diagnosticsExpanded ? "Collapse" : "Expand Details"}</span>
              {diagnosticsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {diagnosticsExpanded && (
            <div className="p-4 border-t border-border/60 space-y-4 text-xs font-mono">
              {/* Evidence banner */}
              <div className="rounded-lg border border-border bg-surface p-3 space-y-1 font-sans">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Coverage Evidence & Verification
                </span>
                <p className="text-xs text-foreground font-medium">
                  {statistics.coverageEvidence}
                </p>
                {statistics.coverageStatus === "standard_scan_completed" && statistics.providerReportedVideos && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                    Tip: Standard Scan stopped at its configured page budget. Switch strategy to &quot;Deep Catalog Scan&quot; to automatically partition date ranges and retrieve the entire historical archive.
                  </p>
                )}
              </div>

              {/* Window Partitions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 text-[10px] uppercase tracking-wider text-muted-foreground font-sans">
                      <th className="py-2 pr-3">Partition Window</th>
                      <th className="py-2 px-3">Date Range</th>
                      <th className="py-2 px-3 text-right">Pages</th>
                      <th className="py-2 px-3 text-right">Unique Items</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-[11px]">
                    {diagnostics.windows.map((w, idx) => (
                      <tr key={w.windowId || idx} className="hover:bg-surface/60 transition-colors">
                        <td className="py-2 pr-3 font-semibold text-foreground">
                          {w.label}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {w.dateFrom && w.dateTo
                            ? `${w.dateFrom} → ${w.dateTo}`
                            : "Full Query Window"}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-foreground">
                          {w.pageCount}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-primary">
                          {w.uniqueCount}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                              w.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : w.status === "capped"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-neutral-500/10 text-neutral-400"
                            )}
                          >
                            {w.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Chronological Landmarks (Oldest vs Newest) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Oldest Retrieved Video Card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Oldest Retrieved Video
              </h4>
            </div>
            {chronology.oldestVideo?.date && (
              <span className="text-xs font-mono text-muted-foreground">
                {new Date(chronology.oldestVideo.date).toLocaleDateString()}
              </span>
            )}
          </div>

          {chronology.oldestVideo ? (
            <div className="flex items-start gap-3">
              <div className="relative aspect-video w-32 shrink-0 rounded-lg overflow-hidden bg-surface border border-border/70">
                {chronology.oldestVideo.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chronology.oldestVideo.thumbnail}
                    alt={chronology.oldestVideo.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Tv className="h-6 w-6 opacity-40" />
                  </div>
                )}
                {chronology.oldestVideo.duration !== null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.2 text-[10px] font-mono text-white">
                    {formatDuration(chronology.oldestVideo.duration)}
                  </span>
                )}
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <a
                  href={chronology.oldestVideo.url || `https://www.dailymotion.com/video/${chronology.oldestVideo.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-foreground hover:text-primary transition-colors line-clamp-2"
                >
                  {chronology.oldestVideo.title}
                </a>
                <p className="text-[11px] font-mono text-muted-foreground">
                  ID: {chronology.oldestVideo.id}
                </p>
                <div className="pt-1">
                  <a
                    href={chronology.oldestVideo.url || `https://www.dailymotion.com/video/${chronology.oldestVideo.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    Watch on Dailymotion <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No dated video records retrieved yet.
            </p>
          )}
        </div>

        {/* Newest Retrieved Video Card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Newest Retrieved Video
              </h4>
            </div>
            {chronology.newestVideo?.date && (
              <span className="text-xs font-mono text-muted-foreground">
                {new Date(chronology.newestVideo.date).toLocaleDateString()}
              </span>
            )}
          </div>

          {chronology.newestVideo ? (
            <div className="flex items-start gap-3">
              <div className="relative aspect-video w-32 shrink-0 rounded-lg overflow-hidden bg-surface border border-border/70">
                {chronology.newestVideo.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chronology.newestVideo.thumbnail}
                    alt={chronology.newestVideo.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Tv className="h-6 w-6 opacity-40" />
                  </div>
                )}
                {chronology.newestVideo.duration !== null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.2 text-[10px] font-mono text-white">
                    {formatDuration(chronology.newestVideo.duration)}
                  </span>
                )}
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <a
                  href={chronology.newestVideo.url || `https://www.dailymotion.com/video/${chronology.newestVideo.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-foreground hover:text-primary transition-colors line-clamp-2"
                >
                  {chronology.newestVideo.title}
                </a>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-mono text-muted-foreground">
                    ID: {chronology.newestVideo.id}
                  </p>
                  {chronology.isRecentlyActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active ({chronology.lastActivityRelative})
                    </span>
                  )}
                </div>
                <div className="pt-1">
                  <a
                    href={chronology.newestVideo.url || `https://www.dailymotion.com/video/${chronology.newestVideo.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    Watch on Dailymotion <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No dated video records retrieved yet.
            </p>
          )}
        </div>
      </div>

      {/* 4. Distribution by Year & Interactive Filter Chips */}
      {distribution.byYear.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {targetId?.resolvedKind === "playlist"
                  ? "Constituent Video Upload Years"
                  : "Catalog Distribution by Year"}
              </h4>
              <p className="text-[11px] text-muted-foreground">
                {targetId?.resolvedKind === "playlist"
                  ? "Distribution of constituent video upload dates inside this playlist. Click any year to filter items locally."
                  : "Click any year to filter retrieved items in the workspace below without network calls."}
              </p>
            </div>
            {activeYearFilter !== null && (
              <button
                type="button"
                onClick={() => onSelectYearFilter(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                Clear Year Filter (Showing all)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {distribution.byYear.map((yr) => {
              const isSelected = activeYearFilter === yr.year;
              return (
                <button
                  key={yr.year}
                  type="button"
                  onClick={() => onSelectYearFilter(isSelected ? null : yr.year)}
                  className={cn(
                    "flex flex-col rounded-lg border p-2.5 text-left transition-all cursor-pointer shadow-2xs",
                    isSelected
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-border/70 bg-surface hover:bg-surface-muted hover:border-border"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-foreground">
                      {yr.year}
                    </span>
                    <span className="text-xs font-bold text-primary">
                      {yr.count}
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-border/40 overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.max(yr.percentage, 5)}%` }}
                    />
                  </div>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {yr.percentage}% of retrieved
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
