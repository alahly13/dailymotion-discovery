"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Bookmark, BookmarkCheck, CalendarDays, Check, Clock3, Copy, ExternalLink, Eye, Languages, PlayCircle, UserRound } from "lucide-react";
import type { ManifestResultViewMode, NormalizedVideoMetadata, VideoCollectionProvenance } from "@/types/video";
import { Card } from "@/components/ui/card";
import { VideoHoverPreview } from "./video-hover-preview";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import type { DiscoveryItem } from "@/lib/discovery/types";

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

function formatDuration(value: number | null) {
  if (value === null) return "Unknown";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatViews(value: number | null) {
  if (value === null) return "Unknown views";
  return `${numberFormatter.format(value)} views`;
}

function formatDate(value: string | null, year: number | null) {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return dateFormatter.format(date);
  }
  return year ? String(year) : "Unknown date";
}

function formatWindow(provenance: VideoCollectionProvenance | undefined) {
  if (!provenance?.windowStart && !provenance?.windowEnd) return null;
  const start = provenance.windowStart?.slice(0, 10) ?? "open";
  const end = provenance.windowEnd?.slice(0, 10) ?? "open";
  return `${start} -> ${end}`;
}

function provenanceBadgeText(provenance: VideoCollectionProvenance | undefined) {
  if (!provenance) return "Attempt unknown";
  if (provenance.duplicateStatus === "already_collected") return "Already collected";
  if (provenance.duplicateStatus === "first_seen_earlier") return "First seen earlier";
  return provenance.attemptNumber ? `Attempt #${provenance.attemptNumber}` : "First seen";
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" | "success" | "warning" }) {
  const toneClass = {
    neutral: "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)]",
    primary: "border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]",
    success: "border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
    warning: "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]",
  }[tone];

  return <span className={`metadata-chip inline-flex min-w-0 max-w-full rounded-md border px-2 py-1 text-[11px] font-black uppercase leading-snug ${toneClass}`}>{children}</span>;
}

function toDiscoveryItem(video: NormalizedVideoMetadata): DiscoveryItem {
  return {
    kind: "video",
    apiVersion: "v1",
    id: video.id,
    title: video.title,
    description: video.description ?? null,
    thumbnail: video.thumbnail ?? null,
    url: video.url ?? null,
    duration: video.duration ?? null,
    language: video.language ?? null,
    country: null,
    category: video.channelName ?? null,
    createdAt: video.createdAt ?? null,
    year: video.year ?? null,
    tags: video.tags ?? [],
    ownerId: video.ownerId ?? null,
    ownerName: video.ownerName ?? video.channelName ?? null,
    views: video.views ?? null,
    extra: {},
    raw: video,
  };
}

export function VideoCard({ video, resultViewMode = "combined" }: { video: NormalizedVideoMetadata; resultViewMode?: ManifestResultViewMode }) {
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();
  const cKey = `v1:video:${video.id}`;
  const isSaved = merged.savedKeys.has(cKey) || workspace.isItemSaved("v1", "video", video.id);
  const channel = video.channelName ?? video.ownerName ?? "Unknown channel";
  const provenance = video.collectionProvenance ? { ...video.collectionProvenance, resultViewMode } : undefined;
  const sourceLabel = provenance?.sourceName ?? provenance?.sourceHandle ?? channel;
  const windowLabel = formatWindow(provenance);
  const metadata = [
    { icon: UserRound, label: channel },
    { icon: Eye, label: formatViews(video.views) },
    { icon: CalendarDays, label: formatDate(video.createdAt, video.year) },
    { icon: Languages, label: video.language ?? "Any language" },
  ];

  return (
    <Card className="group overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]">
      <div
        className="relative aspect-video bg-[var(--surface-container-high)]"
        onMouseEnter={() => setPreview(true)}
        onMouseLeave={() => setPreview(false)}
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-[1.015] group-hover:opacity-100"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
            <PlayCircle className="mr-2 h-5 w-5" aria-hidden="true" />
            No thumbnail
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-1 font-mono text-xs font-black text-white shadow">
          <Clock3 className="mr-1 inline h-3 w-3" aria-hidden="true" />
          {formatDuration(video.duration)}
        </span>
        {preview ? <VideoHoverPreview embedUrl={video.embedUrl} title={video.title} /> : null}
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <h3 className="text-anywhere line-clamp-2 text-base font-black leading-snug transition group-hover:text-[var(--primary)]">{video.title}</h3>
          <p className="line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
            {video.description ?? "No description available."}
          </p>
        </div>

        <div className="grid min-w-0 gap-2 text-xs text-[var(--muted-foreground)] sm:grid-cols-2 overflow-hidden">
          {metadata.map(({ icon: Icon, label }) => (
            <span key={`${video.id}-${label}`} className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </span>
          ))}
        </div>

        <div className="chip-row gap-1.5">
          <Chip tone="primary">{sourceLabel ? `Source: ${sourceLabel}` : "Source unknown"}</Chip>
          <Chip tone={provenance?.duplicateStatus === "new_in_attempt" ? "success" : "neutral"}>{provenanceBadgeText(provenance)}</Chip>
          <Chip>{provenance?.fetchProfile ?? "Profile unknown"}</Chip>
          <Chip>{provenance?.manifestScope === "combined" ? "Combined Manifest" : provenance?.manifestLabel ?? "Attempt Manifest"}</Chip>
          <Chip>{resultViewMode === "combined" ? "Combined Results" : resultViewMode === "by-attempt" ? "By Attempt" : "Current Attempt"}</Chip>
          {windowLabel ? <Chip tone="warning">Window {windowLabel}</Chip> : null}
          {provenance?.pageNumber ? <Chip>Page {provenance.pageNumber}</Chip> : null}
          {provenance?.collectedAt ? <Chip>Added {provenance.collectedAt.slice(0, 10)}</Chip> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {video.url ? (
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 max-w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-center text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
            >
              Open
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
          <button
            type="button"
            aria-pressed={isSaved}
            onClick={() => {
              const item = toDiscoveryItem(video);
              void merged.coordinator.toggleSaveItem(item);
              if (workspace.isItemSaved("v1", "video", video.id)) {
                workspace.removeItem("v1", "video", video.id);
              } else {
                workspace.saveItem(item);
              }
            }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-black uppercase transition ${
              isSaved
                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
            }`}
          >
            {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
            {isSaved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(video.id);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? "Copied ID" : video.id}
          </button>
        </div>
      </div>
    </Card>
  );
}
