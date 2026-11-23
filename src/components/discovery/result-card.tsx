/**
 * Shared resource-aware discovery result card (v1 + v2 workspaces, Unified Search, Collections).
 *
 * What this controls: renders normalized DiscoveryItem records across all
 * Dailymotion resource kinds (`video`, `channel`, `playlist`, `user`, `live`)
 * with type-specific layouts, version badges, zero-safe engagement stats,
 * Save/Favorite controls, Personal Collection picker, Copy ID/URL helpers,
 * and Raw JSON drawer trigger.
 * Scope: DiscoveryExplorer, UnifiedSearch, Saved/Collections views.
 */

"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FolderPlus,
  Info,
  Library,
  Radio,
  Star,
  Tv,
  User,
  UsersRound,
} from "lucide-react";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  canonicalDailymotionUrl,
  classifyDiscoveryItem,
  RESOURCE_TYPE_META,
} from "@/lib/resources/dailymotion-resource-taxonomy";
import { AddToPlaylistModal } from "@/components/playlists/add-to-playlist-modal";
import { formatSafeDescription } from "@/lib/utils/format-description";
import { RawJsonDrawer } from "./raw-json-drawer";

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds === undefined) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatViews(views: number | null | undefined): string {
  if (views === null || views === undefined) return "0 views";
  return `${compactNumber.format(views)} views`;
}

/**
 * Formats API Unix timestamp (seconds or ms) or ISO-8601 string into a human-readable UTC timestamp.
 * Strictly adheres to UTC representation and never converts Unix seconds into invalid milliseconds.
 */
export function formatApiDate(dateStrOrNum: string | number | null | undefined): string | null {
  if (dateStrOrNum === null || dateStrOrNum === undefined || dateStrOrNum === "") return null;
  let d: Date;
  if (typeof dateStrOrNum === "number") {
    const ms = dateStrOrNum < 2e10 ? dateStrOrNum * 1000 : dateStrOrNum;
    d = new Date(ms);
  } else {
    const trimmed = String(dateStrOrNum).trim();
    if (/^\d+$/.test(trimmed)) {
      const numVal = Number(trimmed);
      const ms = numVal < 2e10 ? numVal * 1000 : numVal;
      d = new Date(ms);
    } else {
      d = new Date(trimmed);
    }
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export interface CollectionTargetOption {
  id: string;
  name: string;
}

export interface ResultCardProps {
  item: DiscoveryItem;
  saved: boolean;
  onToggleSave: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  collections?: CollectionTargetOption[];
  onAddToCollection?: (collectionId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function ResultCard({
  item,
  saved,
  onToggleSave,
  favorite,
  onToggleFavorite,
  collections,
  onAddToCollection,
  selectable,
  selected,
  onToggleSelect,
}: ResultCardProps) {
  const [rawOpen, setRawOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [pickedCollection, setPickedCollection] = useState("");
  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const [apiDetailsOpen, setApiDetailsOpen] = useState(false);

  const taxonomy = classifyDiscoveryItem(item);
  const meta = RESOURCE_TYPE_META[taxonomy];
  const openUrl = canonicalDailymotionUrl(item.kind, item.id, item.url);
  const durationLabel = formatDuration(item.duration);
  const extra = (item.extra ?? {}) as Record<string, unknown>;
  const videosTotal = typeof extra.videosTotal === "number" ? extra.videosTotal : (typeof extra.videos_total === "number" ? extra.videos_total : null);
  const followersTotal = typeof extra.fansTotal === "number" ? extra.fansTotal : (typeof extra.fans_total === "number" ? extra.fans_total : null);
  const visibility = typeof extra.visibility === "string" ? extra.visibility : null;
  const liveStatus = typeof extra.status === "string" ? extra.status : null;
  const isExplicit = extra.explicit === true || extra.is_explicit === true;
  const isKids = extra.is_for_kids === true || extra.is_created_for_kids === true;
  const safeDesc = formatSafeDescription(item.description);

  // Formatted semantic date strings
  const formattedUploadDate = formatApiDate(item.videoCreatedAt || item.createdAt);
  const formattedPlaylistDate = formatApiDate(item.playlistCreatedAt || item.createdAt);
  const formattedModifiedDate = formatApiDate(item.updatedAt || (extra.modified_time as any));
  const formattedPublishedDate = formatApiDate(item.publishedAt || (extra.publishedAt as any));

  async function copyText(text: string, which: "id" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "id") {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 1600);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 1600);
      }
    } catch {
      /* clipboard blocked */
    }
  }

  function handleCollectionPick(collectionId: string) {
    setPickedCollection(collectionId);
    if (!collectionId || !onAddToCollection) return;
    onAddToCollection(collectionId);
    const colName = collections?.find((c) => c.id === collectionId)?.name ?? "Collection";
    setAddedNotice(`Added to ${colName}`);
    setTimeout(() => {
      setAddedNotice(null);
      setPickedCollection("");
    }, 1800);
  }

  // Common Action Buttons Row
  const renderActions = (exploreLink?: string, exploreLabel?: string) => (
    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
      {exploreLink && (
        <Link
          href={exploreLink}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-2.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          <Tv className="h-3.5 w-3.5" />
          <span>{exploreLabel || "Explore"}</span>
        </Link>
      )}

      <button
        type="button"
        onClick={onToggleSave}
        aria-pressed={saved}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition cursor-pointer ${
          saved
            ? "border-primary bg-primary text-primary-foreground shadow-xs"
            : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--foreground)] hover:border-primary"
        }`}
        title={saved ? "Unsave from local storage" : "Save to local storage"}
      >
        {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
        <span>{saved ? "Saved" : "Save"}</span>
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={Boolean(favorite)}
          aria-label={favorite ? "Remove favorite" : "Favorite item"}
          className={`inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-bold transition cursor-pointer ${
            favorite
              ? "border-amber-500/60 bg-amber-500/15 text-amber-500"
              : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
          title={favorite ? "Favorited" : "Mark as favorite"}
        >
          <Star className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} />
        </button>
      )}

      <AddToPlaylistModal
        item={item}
        onAdded={(name) => {
          setAddedNotice(`Added to ${name}!`);
          setTimeout(() => setAddedNotice(null), 1800);
        }}
      />

      <button
        type="button"
        onClick={() => void copyText(item.id, "id")}
        title="Copy provider ID"
        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
      >
        {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        <span>ID</span>
      </button>

      {openUrl && (
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer noopener"
          title="Open on Dailymotion"
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--primary)] hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Open</span>
        </a>
      )}

      <button
        type="button"
        onClick={() => setRawOpen(true)}
        className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)] cursor-pointer"
        title="Inspect Raw JSON response"
      >
        <Code2 className="h-3.5 w-3.5" />
        <span>JSON</span>
      </button>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════
     1. CHANNEL / USER / PROFILE CARD LAYOUT
     ═══════════════════════════════════════════════════════════════════════════ */
  if (taxonomy === "CHANNEL" || taxonomy === "PROFILE" || taxonomy === "USER") {
    const channelId = item.id;
    return (
      <>
        <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/70 shadow-xs">
          {/* Header Gradient Banner */}
          <div className="relative h-20 bg-gradient-to-br from-amber-500/20 via-primary/10 to-indigo-500/10">
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black uppercase text-amber-400 backdrop-blur-xs">
                {meta.shortLabel}
              </span>
              <span className="rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white/80">
                {item.apiVersion.toUpperCase()}
              </span>
            </div>
            {selectable && onToggleSelect && (
              <label className="absolute left-2.5 top-2.5 inline-flex cursor-pointer items-center rounded-md bg-black/60 p-1 backdrop-blur-xs">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  onChange={onToggleSelect}
                  aria-label={`Select ${item.title}`}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
              </label>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2.5 p-4">
            {/* Overlapping Avatar */}
            <div className="-mt-9 flex items-end gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--card)] bg-[var(--surface-container-high)] shadow-md">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <User className="h-7 w-7 text-[var(--muted-foreground)]" />
                )}
              </div>
              <div className="min-w-0 pb-0.5">
                <h3 className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition">
                  {item.title}
                </h3>
                <p className="truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                  {channelId}
                </p>
              </div>
            </div>

            {/* Description */}
            {safeDesc && (
              <div className="text-xs text-[var(--muted-foreground)]">
                <p className={descExpanded ? "leading-5 whitespace-pre-line" : "line-clamp-2 leading-5"}>{safeDesc}</p>
                {safeDesc.length > 90 && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((p) => !p)}
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--primary)] hover:underline"
                  >
                    {descExpanded ? <>Less <ChevronUp className="h-3 w-3" /></> : <>More <ChevronDown className="h-3 w-3" /></>}
                  </button>
                )}
              </div>
            )}

            {/* Channel Metrics Badges */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {followersTotal !== null && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-container-high)] px-2 py-0.5 font-bold text-[var(--foreground)]">
                  <UsersRound className="h-3 w-3 text-[var(--muted-foreground)]" />
                  {compactNumber.format(followersTotal)} followers
                </span>
              )}
              {videosTotal !== null && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-container-high)] px-2 py-0.5 font-bold text-[var(--foreground)]">
                  <Tv className="h-3 w-3 text-[var(--muted-foreground)]" />
                  {compactNumber.format(videosTotal)} videos
                </span>
              )}
              {item.views !== null && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-container-high)] px-2 py-0.5 font-bold text-[var(--foreground)]">
                  <Eye className="h-3 w-3 text-[var(--muted-foreground)]" />
                  {formatViews(item.views)}
                </span>
              )}
              {item.country && (
                <span className="rounded-md bg-[var(--surface-container-high)] px-2 py-0.5 font-bold text-[var(--muted-foreground)]">
                  {item.country}
                </span>
              )}
            </div>

            {addedNotice && (
              <p className="text-[11px] font-bold text-emerald-500" role="status">
                {addedNotice}
              </p>
            )}

            {renderActions(`/link-explorer?url=${encodeURIComponent(channelId)}`, "Explore Channel")}
          </div>
        </article>

        <RawJsonDrawer
          open={rawOpen}
          title={item.title}
          subtitle={`${item.apiVersion.toUpperCase()} · ${meta.label} · ${item.id}`}
          payload={item.raw}
          onClose={() => setRawOpen(false)}
        />
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     2. PLAYLIST CARD LAYOUT
     ═══════════════════════════════════════════════════════════════════════════ */
  if (taxonomy === "PLAYLIST") {
    return (
      <>
        <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/70 shadow-xs">
          {/* Thumbnail with Stack Overlay */}
          <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-container-high)]">
            {item.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Library className="h-10 w-10 text-[var(--muted-foreground)]/50" />
              </div>
            )}
            {/* Playlist right-side overlay */}
            <div className="absolute inset-y-0 right-0 flex w-24 flex-col items-center justify-center bg-black/75 backdrop-blur-xs text-white">
              <Library className="h-5 w-5 mb-1 text-[var(--primary)]" />
              <span className="text-xs font-black">{videosTotal ?? "—"}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">Videos</span>
            </div>
            {/* Version Badge */}
            <div className="absolute left-2 top-2">
              <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                {item.apiVersion.toUpperCase()} PLAYLIST
              </span>
            </div>
            {selectable && onToggleSelect && (
              <label className="absolute left-2 bottom-2 inline-flex cursor-pointer items-center rounded-md bg-black/60 p-1 backdrop-blur-xs">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  onChange={onToggleSelect}
                  aria-label={`Select ${item.title}`}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
              </label>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2 p-4">
            <h3 className="line-clamp-2 text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition">
              {item.title}
            </h3>

            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              {item.ownerName && (
                <span className="font-semibold text-[var(--foreground)]">
                  Created by {item.ownerName}
                </span>
              )}
              {item.ownerName && <span>•</span>}
              <span className="font-mono text-[11px]">ID: {item.id}</span>
            </div>

            {/* Prominent Playlist Creation Date (Strictly distinguishes from video upload dates) */}
            <div className="rounded-lg bg-[var(--surface-container-high)]/70 border border-border/60 px-2.5 py-1.5 flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-foreground">Playlist Creation Date:</span>
                <span className="font-mono text-muted-foreground">
                  {formattedPlaylistDate || "Not provided by API"}
                </span>
              </div>
            </div>

            {safeDesc && (
              <p className="line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{safeDesc}</p>
            )}

            {/* Expandable More API Details Section */}
            <div className="border-t border-border/50 pt-2 mt-1">
              <button
                type="button"
                onClick={() => setApiDetailsOpen((prev) => !prev)}
                className="flex items-center justify-between w-full text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="h-3 w-3 text-primary" />
                  More API Details
                </span>
                {apiDetailsOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {apiDetailsOpen && (
                <div className="mt-2 rounded-lg border border-border/60 bg-surface/80 p-2.5 space-y-1.5 text-[11px] font-mono animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">API Version / Source:</span>
                    <span className="font-bold text-foreground">{item.apiVersion.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">Original ID Field ({item.apiVersion === "v1" ? "id" : "playlist_id"}):</span>
                    <span className="text-foreground">{item.id}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">Creation Date ({item.apiVersion === "v1" ? "created_time" : "created_at"}):</span>
                    <span className="text-foreground">{formattedPlaylistDate || "Not returned"}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">Total Videos ({item.apiVersion === "v1" ? "videos_total" : "videos_total"}):</span>
                    <span className="text-foreground">{videosTotal !== null ? String(videosTotal) : "Not returned"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Endpoint:</span>
                    <span className="text-muted-foreground text-[10px]">{item.sourceEndpoint || (item.apiVersion === "v1" ? "GET /user/{id}/playlists" : "GET /v2/profiles/{id}/playlists")}</span>
                  </div>
                </div>
              )}
            </div>

            {addedNotice && (
              <p className="text-[11px] font-bold text-emerald-500" role="status">
                {addedNotice}
              </p>
            )}

            {renderActions()}
          </div>
        </article>

        <RawJsonDrawer
          open={rawOpen}
          title={item.title}
          subtitle={`${item.apiVersion.toUpperCase()} · ${meta.label} · ${item.id}`}
          payload={item.raw}
          onClose={() => setRawOpen(false)}
        />
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     3. LIVESTREAM CARD LAYOUT
     ═══════════════════════════════════════════════════════════════════════════ */
  if (taxonomy === "LIVESTREAM") {
    return (
      <>
        <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/70 shadow-xs">
          <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-container-high)]">
            {item.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Radio className="h-10 w-10 text-red-500/50" />
              </div>
            )}
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-md animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              LIVE
            </div>
            {item.views !== null && (
              <span className="absolute right-2 bottom-2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white">
                {compactNumber.format(item.views)} viewers
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2 p-4">
            <h3 className="line-clamp-2 text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition">
              {item.title}
            </h3>

            <p className="text-xs text-[var(--muted-foreground)]">
              {item.ownerName ? `Streamer: ${item.ownerName}` : item.id}
            </p>

            {addedNotice && (
              <p className="text-[11px] font-bold text-emerald-500" role="status">
                {addedNotice}
              </p>
            )}

            {renderActions()}
          </div>
        </article>

        <RawJsonDrawer
          open={rawOpen}
          title={item.title}
          subtitle={`${item.apiVersion.toUpperCase()} · ${meta.label} · ${item.id}`}
          payload={item.raw}
          onClose={() => setRawOpen(false)}
        />
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     4. STANDARD VIDEO CARD LAYOUT (DEFAULT)
     ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/70 shadow-xs">
        {/* 16:9 Thumbnail Container */}
        <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-container-high)]">
          {item.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnail}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--muted-foreground)]">
              <Tv className="mr-1.5 h-4 w-4" /> No thumbnail
            </div>
          )}

          {/* Duration Badge */}
          {durationLabel !== null && (
            <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[11px] font-black text-white shadow-xs">
              <Clock3 className="h-3 w-3" />
              {durationLabel}
            </span>
          )}

          {/* Badges Overlay on Top */}
          <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
              {item.apiVersion.toUpperCase()}
            </span>
            {isExplicit && (
              <span className="rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-black text-white">
                EXPLICIT
              </span>
            )}
            {isKids && (
              <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-black text-white">
                KIDS
              </span>
            )}
          </div>

          {/* Selectable Checkbox */}
          {selectable && onToggleSelect && (
            <label className="absolute right-2 top-2 inline-flex cursor-pointer items-center rounded-md bg-black/60 p-1 backdrop-blur-xs">
              <input
                type="checkbox"
                checked={Boolean(selected)}
                onChange={onToggleSelect}
                aria-label={`Select ${item.title}`}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>
          )}
        </div>

        {/* Content Body */}
        <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
          {/* Title */}
          {openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="line-clamp-2 text-sm font-bold text-[var(--foreground)] transition group-hover:text-[var(--primary)] leading-snug"
            >
              {item.title}
            </a>
          ) : (
            <h3 className="line-clamp-2 text-sm font-bold text-[var(--foreground)] leading-snug">
              {item.title}
            </h3>
          )}

          {/* Prominent Video Upload Date Box (Never mixed with playlist creation dates) */}
          <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-xs">
            <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                Uploaded to Dailymotion
              </span>
              <span className="font-mono font-medium text-foreground truncate">
                {formattedUploadDate || "Not provided by API"}
              </span>
            </div>
          </div>

          {/* Metadata Row: Owner + Views + Date + ID */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
            {item.ownerName && (
              <span className="truncate font-semibold text-[var(--foreground)] max-w-[150px]">
                {item.ownerName}
              </span>
            )}
            {item.ownerName && <span>•</span>}
            <span>{formatViews(item.views)}</span>
            {item.year && (
              <>
                <span>•</span>
                <span>{item.year}</span>
              </>
            )}
            {item.category && (
              <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.2 text-[10px] font-bold">
                {item.category}
              </span>
            )}
            <span>•</span>
            <span className="font-mono text-[10px] text-[var(--muted-foreground)]">ID: {item.id}</span>
          </div>

          {/* Expandable Description */}
          {safeDesc && (
            <div className="text-xs text-[var(--muted-foreground)]">
              <p className={descExpanded ? "leading-5 whitespace-pre-line" : "line-clamp-2 leading-5"}>{safeDesc}</p>
              {safeDesc.length > 100 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((p) => !p)}
                  className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--primary)] hover:underline cursor-pointer"
                >
                  {descExpanded ? <>Less <ChevronUp className="h-3 w-3" /></> : <>More <ChevronDown className="h-3 w-3" /></>}
                </button>
              )}
            </div>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted-foreground)]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Expandable Scientific / API Details */}
          <div className="border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={() => setApiDetailsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                More API Details
              </span>
              {apiDetailsOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {apiDetailsOpen && (
              <div className="mt-2 rounded-lg border border-border/60 bg-surface/80 p-2.5 space-y-1.5 text-[11px] font-mono animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">API Version / Source:</span>
                  <span className="font-bold text-foreground">{item.apiVersion.toUpperCase()} (Native)</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Original ID Field ({item.apiVersion === "v1" ? "id" : "video_id"}):</span>
                  <span className="text-foreground">{item.id}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Upload Timestamp ({item.apiVersion === "v1" ? "created_time" : "created_at"}):</span>
                  <span className="text-foreground">{formattedUploadDate || "Not returned"}</span>
                </div>
                {formattedModifiedDate && (
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">Last Modified ({item.apiVersion === "v1" ? "modified_time" : "updated_at"}):</span>
                    <span className="text-foreground">{formattedModifiedDate}</span>
                  </div>
                )}
                {formattedPublishedDate && formattedPublishedDate !== formattedUploadDate && (
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">Published Date (published_at):</span>
                    <span className="text-foreground">{formattedPublishedDate}</span>
                  </div>
                )}
                {item.availableAt && (
                  <div className="flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="text-muted-foreground">Availability (available_at):</span>
                    <span className="text-foreground">{formatApiDate(item.availableAt)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Views ({item.apiVersion === "v1" ? "views_total" : "views"}):</span>
                  <span className="text-foreground">{item.views !== null ? item.views.toLocaleString() : "Not returned"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Duration ({item.apiVersion === "v1" ? "duration [s]" : "duration [s]"}):</span>
                  <span className="text-foreground">{durationLabel || "Not returned"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Content Flags:</span>
                  <span className="text-foreground">
                    {[isExplicit ? "Explicit" : null, isKids ? "Made for Kids" : null].filter(Boolean).join(", ") || "Standard"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <span className="text-muted-foreground text-[10px]">{item.sourceEndpoint || (item.apiVersion === "v1" ? "GET /videos" : "GET /v2/profiles/{id}/videos")}</span>
                </div>
              </div>
            )}
          </div>

          {addedNotice && (
            <p className="text-[11px] font-bold text-emerald-500" role="status">
              {addedNotice}
            </p>
          )}

          {/* Action Buttons */}
          {renderActions()}
        </div>
      </article>

      <RawJsonDrawer
        open={rawOpen}
        title={item.title}
        subtitle={`${item.apiVersion.toUpperCase()} · ${meta.label} · ${item.id}`}
        payload={item.raw}
        onClose={() => setRawOpen(false)}
      />
    </>
  );
}
