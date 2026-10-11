// Shared discovery result card (v1 + v2 workspaces, unified Search).
//
// What this controls: how one normalized DiscoveryItem renders everywhere.
// Why shared: identical presentation, version badge always visible, save
// toggle and raw inspection behave the same on every page.
// Scope: DiscoveryExplorer + unified Search. Future agents: change card
// design here once, not per page.

"use client";

import type { DiscoveryItem } from "@/lib/discovery/types";

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ResultCardProps {
  item: DiscoveryItem;
  saved: boolean;
  onToggleSave: () => void;
}

export function ResultCard({ item, saved, onToggleSave }: ResultCardProps) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
      {item.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
      )}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap gap-1 text-[10px] font-black uppercase">
          <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.kind}</span>
          <span className="rounded bg-[var(--primary)]/15 px-1.5 py-0.5 text-[var(--primary)]">{item.apiVersion}</span>
          {item.year && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.year}</span>}
          {item.duration !== null && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{formatDuration(item.duration)}</span>}
          {item.language && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.language}</span>}
          {item.category && <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">{item.category}</span>}
        </div>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer noopener" className="line-clamp-2 font-black hover:underline">{item.title}</a>
        ) : (
          <h3 className="line-clamp-2 font-black">{item.title}</h3>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          {[item.ownerName, item.id].filter(Boolean).join(" · ")}
        </p>
        {item.description && <p className="line-clamp-3 text-xs leading-5 text-[var(--muted-foreground)]">{item.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onToggleSave}
            aria-pressed={saved}
            className="min-h-9 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase"
          >
            {saved ? "Unsave" : "Save item"}
          </button>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-[var(--muted-foreground)]">Raw {item.apiVersion} response</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-[var(--surface-container-low)] p-2">{JSON.stringify(item.raw, null, 2)}</pre>
        </details>
      </div>
    </article>
  );
}
