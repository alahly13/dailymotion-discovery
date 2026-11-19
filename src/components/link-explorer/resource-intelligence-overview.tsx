// Resource Intelligence Overview — Dailymotion Channel, Playlist & Resource Intelligence Dashboard (2026)
//
// What this controls: Comprehensive analytical dashboard rendered immediately below the Link Explorer
// input. Displays profile metadata, verified vs local statistical counters, chronological landmarks
// (oldest video, newest video, registration date), and interactive year/month distribution graphs.
// Why it exists: Transforms Link Explorer from a basic single-page fetcher into a deep intelligence workspace.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  FileCheck2,
  Film,
  Globe2,
  History,
  Layers,
  Library,
  Radio,
  Share2,
  Sparkles,
  TrendingUp,
  Tv,
  UsersRound,
} from "lucide-react";
import type { ResourceIntelligenceData } from "@/lib/link-explorer/link-explorer-types";
import { formatDuration } from "@/components/discovery/result-card";
import { cn } from "@/lib/utils/cn";

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
  const [copiedLink, setCopiedLink] = useState(false);

  const { profile, statistics, chronology, distribution } = data;

  const handleCopyLink = () => {
    if (profile.canonicalUrl) {
      navigator.clipboard.writeText(profile.canonicalUrl).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isLongDescription = (profile.description || "").length > 180;

  return (
    <div className="space-y-6">
      {/* 1. Main Profile & Resource Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

        <div className="flex flex-col md:flex-row items-start justify-between gap-6 relative z-10">
          {/* Avatar & Profile Identity */}
          <div className="flex items-start gap-4">
            <div className="relative h-16 w-16 md:h-20 md:md:w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-border bg-surface shadow-md">
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
                <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted-foreground border border-border">
                  {profile.catalogStatus.replace(/_/g, " ")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
                <span>ID: {profile.id}</span>
                {profile.handle && <span>Handle: {profile.handle}</span>}
                {profile.country && (
                  <span className="flex items-center gap-1 font-sans">
                    <Globe2 className="h-3.5 w-3.5" />
                    {profile.country}
                  </span>
                )}
                {profile.createdDate && (
                  <span className="flex items-center gap-1 font-sans">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined {new Date(profile.createdDate).toLocaleDateString()}
                  </span>
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
                    {profile.description}
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
              href={`/channel-explorer?channel=${encodeURIComponent(profile.id)}`}
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
              : "Unreported"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {statistics.providerReportedVideos !== null
              ? "Official catalog size reported by API"
              : "Provider does not expose fixed count"}
          </p>
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
            Indexed into local memory & snapshot
          </p>
        </div>

        {/* Metric 3: Catalog Coverage */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Catalog Coverage
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-500">
            {statistics.coveragePercent !== null
              ? `${statistics.coveragePercent}%`
              : "100%"}
          </p>
          <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${statistics.coveragePercent || 100}%` }}
            />
          </div>
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
                Catalog Distribution by Year
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Click any year to filter retrieved items in the workspace below without network calls.
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
                    {yr.percentage}% of catalog
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
