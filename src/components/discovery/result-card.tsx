/**
 * Shared resource-aware discovery result card (v1 + v2 workspaces, Unified Search, Collections).
 *
 * What this controls: renders normalized DiscoveryItem records across all
 * Dailymotion resource kinds (`video`, `channel`, `playlist`, `user`, `live`)
 * with version badges, zero-safe engagement stats, Save/Favorite controls,
 * Personal Collection picker, Copy ID/URL helpers, and Raw JSON drawer trigger.
 * Scope: DiscoveryExplorer, UnifiedSearch, Saved/Collections views.
 */

"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Check, Code2, Copy, ExternalLink, FolderPlus, Star } from "lucide-react";
import type { DiscoveryItem } from "@/lib/discovery/types";
import { canonicalDailymotionUrl, classifyDiscoveryItem, RESOURCE_TYPE_META } from "@/lib/resources/dailymotion-resource-taxonomy";
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

export interface CollectionTargetOption {
  id: string;
  name: string;
}

interface ResultCardProps {
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
  const [pickedCollection, setPickedCollection] = useState("");
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const taxonomy = classifyDiscoveryItem(item);
  const meta = RESOURCE_TYPE_META[taxonomy];
  const openUrl = canonicalDailymotionUrl(item.kind, item.id, item.url);
  const durationLabel = formatDuration(item.duration);
  const videosTotal = typeof item.extra?.videosTotal === "number" ? item.extra.videosTotal : null;
  const visibility = typeof item.extra?.visibility === "string" ? item.extra.visibility : null;
  const liveStatus = typeof item.extra?.status === "string" ? item.extra.status : null;
  const isExplicit = item.extra?.explicit === true || item.extra?.is_explicit === true;
  const isKids = item.extra?.is_for_kids === true || item.extra?.is_created_for_kids === true;

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

  return (
    <>
      <article className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition hover:border-[var(--primary)]/70">
        {item.thumbnail && (
          <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-container-high)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
            {durationLabel !== null && (
              <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-black text-white">
                {durationLabel}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col space-y-2.5 p-4">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase">
            {selectable && onToggleSelect && (
              <label className="mr-1 inline-flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  onChange={onToggleSelect}
                  aria-label={`Select ${item.title}`}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
              </label>
            )}
            <span className="rounded bg-[var(--primary)]/15 px-1.5 py-0.5 text-[var(--primary)]">
              {item.apiVersion}
            </span>
            <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">
              {meta.shortLabel}
            </span>
            {item.year && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.year}</span>}
            {item.views !== null && (
              <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">
                {compactNumber.format(item.views)} views
              </span>
            )}
            {videosTotal !== null && (
              <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">
                {videosTotal} videos
              </span>
            )}
            {item.language && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.language}</span>}
            {item.category && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.category}</span>}
            {visibility && (
              <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{visibility}</span>
            )}
            {liveStatus && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-300">
                {liveStatus}
              </span>
            )}
            {isExplicit && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-300">Explicit</span>
            )}
            {isKids && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">Kids</span>
            )}
          </div>

          {openUrl ? (
            <a href={openUrl} target="_blank" rel="noreferrer noopener" className="line-clamp-2 font-black hover:underline">
              {item.title}
            </a>
          ) : (
            <h3 className="line-clamp-2 font-black">{item.title}</h3>
          )}

          <p className="text-xs text-[var(--muted-foreground)]">
            {[item.ownerName, item.id].filter(Boolean).join(" · ")}
          </p>

          {item.description && (
            <p className="line-clamp-3 text-xs leading-5 text-[var(--muted-foreground)]">{item.description}</p>
          )}

          {item.tags.length > 0 && (
            <p className="line-clamp-1 text-[11px] text-[var(--muted-foreground)]">
              Tags: {item.tags.slice(0, 6).join(", ")}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              className={`inline-flex min-h-9 items-center gap-1 rounded-md border px-2.5 text-xs font-black uppercase ${
                saved
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              {saved ? <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
              {saved ? "Unsave" : "Save item"}
            </button>

            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-pressed={Boolean(favorite)}
                aria-label={favorite ? "Remove favorite" : "Favorite item"}
                className={`inline-flex min-h-9 items-center gap-1 rounded-md border px-2 text-xs font-black ${
                  favorite ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300" : "border-[var(--border)]"
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} aria-hidden="true" />
              </button>
            )}

            {collections && collections.length > 0 && onAddToCollection && (
              <label className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold">
                <FolderPlus className="h-3.5 w-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
                <select
                  aria-label={`Add ${item.title} to personal collection`}
                  value={pickedCollection}
                  onChange={(e) => handleCollectionPick(e.target.value)}
                  className="bg-transparent text-xs font-bold outline-none"
                >
                  <option value="">+ Collection</option>
                  {collections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => void copyText(item.id, "id")}
              title="Copy provider ID"
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              ID
            </button>

            {openUrl && (
              <button
                type="button"
                onClick={() => void copyText(openUrl, "url")}
                title="Copy Dailymotion URL"
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                URL
              </button>
            )}

            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer noopener"
                title="Open on Dailymotion"
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs font-bold text-[var(--primary)] hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            )}

            <button
              type="button"
              onClick={() => setRawOpen(true)}
              className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-black uppercase text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              Raw JSON
            </button>
          </div>

          {addedNotice && (
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400" role="status">
              {addedNotice}
            </p>
          )}
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
