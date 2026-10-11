// /workspace — Saved Titles + Search History (tabbed, version-separated).
//
// What this controls: explicit saves vs automatic per-version history.
// Saved Titles: user-chosen resources (version-aware identity: same id on v1
// and v2 are distinct). Search History: one record per submitted search in
// the version that executed it (pagination appends never create entries).
// Both persist in-browser (localStorage) with documented caps; per-version
// clear requires confirmation and never touches the other version.
// Scope: /workspace. Future agents: keep the domains distinct.

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApiVersion } from "@/lib/discovery/types";
import { CloudSyncPanel } from "@/components/discovery/cloud-sync-panel";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";

type Tab = "titles" | "history" | "searches";
type VersionFilter = "all" | ApiVersion;

function versionPath(resource: string, version: ApiVersion): string {
  const base = resource === "general" ? "general" : resource === "channels" ? "channels" : resource;
  return `/${base}-${version}`;
}

export default function WorkspacePage() {
  const workspace = useDiscoveryWorkspace();
  const [tab, setTab] = useState<Tab>("titles");
  const [filter, setFilter] = useState<VersionFilter>("all");
  const [confirmClear, setConfirmClear] = useState<ApiVersion | null>(null);

  const titles = useMemo(
    () => workspace.savedItems.filter((s) => filter === "all" || s.item.apiVersion === filter),
    [workspace.savedItems, filter]
  );
  const history = useMemo(
    () =>
      workspace.history
        .filter((h) => filter === "all" || h.version === filter)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt),
    [workspace.history, filter]
  );

  const tabClass = (active: boolean) =>
    `min-h-10 rounded-md px-4 text-sm font-black ${active ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Workspace</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Saved Titles & Search History</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Saved Titles are resources you explicitly chose. Search History is recorded automatically per API version.
          Stored only in this browser; retention caps: 500 titles, 200 history entries, 100 saved searches (oldest trimmed first).
        </p>
      </div>

      <CloudSyncPanel />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1" role="tablist" aria-label="Workspace sections">
          {([["titles", `Saved Titles (${workspace.savedItems.length})`], ["history", `Search History (${workspace.history.length})`], ["searches", `Saved Searches (${workspace.savedSearches.length})`]] as [Tab, string][]).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={tabClass(tab === value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1" role="radiogroup" aria-label="Version filter">
          {(["all", "v1", "v2"] as VersionFilter[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={filter === v} onClick={() => setFilter(v)} className={tabClass(filter === v)}>
              {v === "all" ? "All" : v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {tab === "titles" && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5" aria-label="Saved titles">
          {titles.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No saved titles{filter !== "all" ? ` for ${filter.toUpperCase()}` : ""} yet. Use “Save item” on any result card — nothing is saved automatically.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {titles.map(({ item, savedAt }) => (
                <div key={`${item.apiVersion}:${item.kind}:${item.id}`} className="rounded-md border border-[var(--border)] p-3 text-sm">
                  <p className="font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    <strong className="text-[var(--primary)]">{item.apiVersion.toUpperCase()}</strong> · {item.kind} · {item.id} · saved {new Date(savedAt).toLocaleString()}
                  </p>
                  {item.description && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">{item.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {item.url && <a href={item.url} target="_blank" rel="noreferrer noopener" className="text-xs font-bold text-[var(--primary)] hover:underline">Open</a>}
                    {item.apiVersion === "v1" && item.kind === "video" ? (
                      <Link href={`/videos-v1?mode=related&id=${encodeURIComponent(item.id)}`} className="text-xs font-bold text-[var(--primary)] hover:underline">
                        Rediscover related
                      </Link>
                    ) : (
                      <Link href={`${versionPath(item.kind === "user" || item.kind === "channel" ? "channels" : item.kind === "playlist" ? "playlists" : "videos", item.apiVersion)}?mode=lookup&id=${encodeURIComponent(item.id)}`} className="text-xs font-bold text-[var(--primary)] hover:underline">
                        Look up again
                      </Link>
                    )}
                    <button type="button" onClick={() => workspace.removeItem(item.apiVersion, item.kind, item.id)} className="text-xs font-bold text-red-500 hover:underline">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5" aria-label="Search history">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              V1: {workspace.history.filter((h) => h.version === "v1").length} · V2: {workspace.history.filter((h) => h.version === "v2").length}
            </p>
            <span className="ml-auto flex gap-2">
              {(["v1", "v2"] as ApiVersion[]).map((v) => (
                confirmClear === v ? (
                  <span key={v} className="inline-flex items-center gap-2 text-xs">
                    Clear {v.toUpperCase()} history?
                    <button type="button" onClick={() => { workspace.clearHistoryForVersion(v); setConfirmClear(null); }} className="min-h-8 rounded-md bg-red-600 px-2 font-black text-white">Confirm</button>
                    <button type="button" onClick={() => setConfirmClear(null)} className="min-h-8 rounded-md border border-[var(--border)] px-2 font-black">Cancel</button>
                  </span>
                ) : (
                  <button key={v} type="button" onClick={() => setConfirmClear(v)} className="min-h-8 rounded-md border border-[var(--border)] px-2 text-xs font-black uppercase">
                    Clear {v.toUpperCase()}
                  </button>
                )
              ))}
            </span>
          </div>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">No history{filter !== "all" ? ` for ${filter.toUpperCase()}` : ""} yet. Submitted searches appear here with their exact query and effective parameters.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3">
                  <span>
                    <strong>{entry.label}</strong>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      <strong className="text-[var(--primary)]">{entry.version.toUpperCase()}</strong> · {entry.resource} · {entry.resultCount ?? "?"} results · {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className="flex gap-3">
                    <Link href={`${versionPath(entry.resource, entry.version)}?${new URLSearchParams(entry.params).toString()}`} className="text-xs font-bold text-[var(--primary)] hover:underline">
                      Re-run
                    </Link>
                    <button type="button" onClick={() => workspace.removeHistoryEntry(entry.id)} className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "searches" && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5" aria-label="Saved searches">
          {workspace.savedSearches.filter((s) => filter === "all" || s.version === filter).length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No saved searches yet. Use “Save search” on any discovery page.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {workspace.savedSearches.filter((s) => filter === "all" || s.version === filter).map((search) => (
                <li key={search.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3">
                  <span>
                    <strong>{search.label}</strong>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">{search.version.toUpperCase()} · {search.resource}</span>
                  </span>
                  <span className="flex gap-3">
                    <Link href={`${versionPath(search.resource, search.version)}?${new URLSearchParams(search.params).toString()}`} className="text-xs font-bold text-[var(--primary)] hover:underline">
                      Re-run
                    </Link>
                    <button type="button" onClick={() => workspace.removeSearch(search.id)} className="text-xs font-bold text-red-500 hover:underline">Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
