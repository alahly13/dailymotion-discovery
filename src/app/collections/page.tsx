"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Code2,
  CopyPlus,
  Download,
  ExternalLink,
  FolderKanban,
  FolderPlus,
  Pencil,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import type { LocalCollectionRecord } from "@/lib/local-first/indexeddb-store";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";
import { canonicalDailymotionUrl, RESOURCE_TYPE_META } from "@/lib/resources/dailymotion-resource-taxonomy";

/**
 * Personal Research Collections workspace (`/collections`).
 *
 * Distinct from Dailymotion platform playlists: collections organize saved
 * v1/v2 videos, profiles, channels, users, and livestreams locally in IndexedDB
 * with outbox sync to PostgreSQL + Cloudflare R2.
 */
export default function CollectionsPage() {
  const merged = useMergedDataset();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editingCol, setEditingCol] = useState<LocalCollectionRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [rawTarget, setRawTarget] = useState<{ title: string; payload: unknown } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const activeCollection = useMemo(() => {
    if (merged.collections.length === 0) return null;
    return merged.collections.find((c) => c.id === selectedId) ?? merged.collections[0];
  }, [merged.collections, selectedId]);

  const collectionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ci of merged.collectionItems) {
      map.set(ci.collectionId, (map.get(ci.collectionId) ?? 0) + 1);
    }
    return map;
  }, [merged.collectionItems]);

  // Identify items that belong to multiple collections so researchers spot overlap cleanly.
  const membershipByItemKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ci of merged.collectionItems) {
      const colName = merged.collections.find((c) => c.id === ci.collectionId)?.name ?? ci.collectionId;
      const list = map.get(ci.itemKey) ?? [];
      list.push(colName);
      map.set(ci.itemKey, list);
    }
    return map;
  }, [merged.collectionItems, merged.collections]);

  const activeItems = useMemo(() => {
    if (!activeCollection) return [];
    const needle = searchText.trim().toLowerCase();
    return merged.collectionItems
      .filter((ci) => ci.collectionId === activeCollection.id)
      .sort((a, b) => a.position - b.position)
      .filter((ci) => {
        if (!needle) return true;
        const text = `${ci.snapshot.title} ${ci.snapshot.ownerName ?? ""} ${ci.note ?? ""} ${ci.itemKey}`.toLowerCase();
        return text.includes(needle);
      });
  }, [activeCollection, merged.collectionItems, searchText]);

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = await merged.coordinator.createCollection({ name: newName, description: newDescription });
    setNewName("");
    setNewDescription("");
    setSelectedId(created.id);
    setStatusBanner(`Created personal collection "${created.name}".`);
  }

  async function handleSaveEdit() {
    if (!editingCol || !editName.trim()) return;
    await merged.coordinator.updateCollection(editingCol.id, { name: editName, description: editDesc });
    setEditingCol(null);
    setStatusBanner("Collection metadata updated.");
  }

  function exportCollection(format: "json" | "csv") {
    if (!activeCollection) return;
    const filenameBase = activeCollection.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "collection";
    let content = "";
    let mime = "application/json";
    if (format === "json") {
      content = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          collection: activeCollection,
          itemCount: activeItems.length,
          items: activeItems,
        },
        null,
        2
      );
    } else {
      mime = "text/csv";
      const rows = activeItems.map((ci) =>
        [
          ci.position + 1,
          `"${ci.itemKey.replaceAll('"', '""')}"`,
          ci.apiVersion,
          ci.resourceType,
          `"${(ci.snapshot.title || "").replaceAll('"', '""')}"`,
          `"${(ci.snapshot.ownerName || "").replaceAll('"', '""')}"`,
          `"${(ci.note || "").replaceAll('"', '""')}"`,
          `"${(ci.snapshot.url || "").replaceAll('"', '""')}"`,
        ].join(",")
      );
      content = `\uFEFFposition,itemKey,apiVersion,resourceType,title,ownerName,note,url\r\n${rows.join("\r\n")}`;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            Workspace · Personal Organization (IndexedDB + R2)
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Personal Research Collections</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">
            Group any discovered Dailymotion videos, channels, profiles, users, livestreams, or platform playlists
            into personal curated workspaces. Completely separate from official Dailymotion playlists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/search"
            className="inline-flex min-h-10 items-center rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]"
          >
            + Discover Items
          </Link>
          <Link
            href="/storage"
            className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-xs font-black uppercase text-primary-foreground hover:opacity-90"
          >
            Cloud Sync ({merged.pendingCount} pending)
          </Link>
        </div>
      </section>

      {statusBanner && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold">
          {statusBanner}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Sidebar: Create + List Collections */}
        <aside className="space-y-4 lg:col-span-4">
          <form
            onSubmit={(e) => void handleCreateCollection(e)}
            className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New Collection
            </div>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection title (e.g. Election Clips 2026)"
              className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold"
            />
            <textarea
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional scope or editorial notes..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-2.5 text-xs"
            />
            <button
              type="submit"
              className="min-h-10 w-full rounded-md bg-primary px-4 text-xs font-black uppercase text-primary-foreground hover:opacity-90"
            >
              Create Collection
            </button>
          </form>

          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <h2 className="px-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Your Collections ({merged.collections.length})
            </h2>
            {merged.collections.length === 0 ? (
              <p className="p-3 text-xs text-[var(--muted-foreground)]">
                No personal collections yet. Create one above, then click &quot;+ Collection&quot; on any search result card.
              </p>
            ) : (
              <div className="space-y-1.5">
                {merged.collections.map((col) => {
                  const isActive = activeCollection?.id === col.id;
                  const count = collectionCounts.get(col.id) ?? 0;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setSelectedId(col.id)}
                      className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? "border-[var(--primary)] bg-[var(--primary)]/10"
                          : "border-[var(--border)] hover:bg-[var(--surface-container-low)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-black text-sm">
                          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                          <span className="truncate">{col.name}</span>
                        </div>
                        {col.description && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted-foreground)]">
                            {col.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-black">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Right Main Area: Active Collection Inspector */}
        <section className="space-y-4 lg:col-span-8">
          {!activeCollection ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
              <p className="text-base font-black">Select or create a collection</p>
              <p className="mt-1 max-w-md text-xs text-[var(--muted-foreground)]">
                Collections stay offline-capable in IndexedDB and sync atomically via Save All.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
                {editingCol?.id === activeCollection.id ? (
                  <div className="space-y-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-base font-black"
                    />
                    <textarea
                      rows={2}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-2.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit()}
                        className="min-h-9 rounded-md bg-primary px-3 text-xs font-black uppercase text-primary-foreground hover:opacity-90"
                      >
                        Save Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCol(null)}
                        className="min-h-9 rounded-md border border-[var(--border)] px-3 text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black">{activeCollection.name}</h2>
                      {activeCollection.description && (
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{activeCollection.description}</p>
                      )}
                      <p className="mt-2 text-[11px] font-bold text-[var(--muted-foreground)]">
                        {activeItems.length} item(s) shown · Updated {new Date(activeCollection.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCol(activeCollection);
                          setEditName(activeCollection.name);
                          setEditDesc(activeCollection.description);
                        }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-xs font-bold hover:border-[var(--primary)]"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => exportCollection("json")}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-xs font-bold hover:border-[var(--primary)]"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" /> JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => exportCollection("csv")}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-xs font-bold hover:border-[var(--primary)]"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete collection "${activeCollection.name}" and its memberships?`)) {
                            void merged.coordinator.deleteCollection(activeCollection.id);
                          }
                        }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-rose-500/40 px-3 text-xs font-bold text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative mt-4">
                  <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Filter items inside this collection..."
                    className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] pr-3 pl-9 text-xs font-semibold"
                  />
                </div>
              </div>

              {activeItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
                  No items match inside this collection yet. Use &quot;+ Collection&quot; on any result card in Search.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeItems.map((ci, index) => {
                    const meta = RESOURCE_TYPE_META[ci.resourceType] ?? RESOURCE_TYPE_META.UNKNOWN;
                    const extUrl = canonicalDailymotionUrl(ci.snapshot.kind, ci.snapshot.id, ci.snapshot.url);
                    const memberships = membershipByItemKey.get(ci.itemKey) ?? [];
                    const currentNote = noteDrafts[ci.id] ?? ci.note ?? "";
                    const targetCol = moveTargets[ci.id] ?? "";
                    const otherCols = merged.collections.filter((c) => c.id !== activeCollection.id);

                    return (
                      <article
                        key={ci.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase">
                              <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5">
                                #{index + 1}
                              </span>
                              <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--primary)]">
                                {ci.apiVersion} · {meta.shortLabel}
                              </span>
                              {memberships.length > 1 && (
                                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-300">
                                  In {memberships.length} collections
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black leading-snug">{ci.snapshot.title || ci.snapshot.id}</h3>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              ID: <code className="font-mono">{ci.snapshot.id}</code>
                              {ci.snapshot.ownerName ? ` · ${ci.snapshot.ownerName}` : ""}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              title="Move up"
                              onClick={() => void merged.coordinator.reorderCollectionItem(activeCollection.id, ci.itemKey, "up")}
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] hover:border-[var(--primary)]"
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              title="Move down"
                              onClick={() => void merged.coordinator.reorderCollectionItem(activeCollection.id, ci.itemKey, "down")}
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] hover:border-[var(--primary)]"
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRawTarget({ title: ci.snapshot.title || ci.snapshot.id, payload: ci.snapshot })}
                              className="inline-flex h-8 items-center gap-1 rounded border border-[var(--border)] px-2 text-[11px] font-bold hover:border-[var(--primary)]"
                            >
                              <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> JSON
                            </button>
                            {extUrl && (
                              <a
                                href={extUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 items-center gap-1 rounded border border-[var(--border)] px-2 text-[11px] font-bold hover:border-[var(--primary)]"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => void merged.coordinator.removeItemFromCollection(activeCollection.id, ci.itemKey)}
                              className="inline-flex h-8 items-center gap-1 rounded border border-rose-500/40 px-2 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                            </button>
                          </div>
                        </div>

                        {/* Research note + move/copy bar */}
                        <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-12">
                          <div className="flex items-center gap-1.5 sm:col-span-7">
                            <StickyNote className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
                            <input
                              type="text"
                              value={currentNote}
                              onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [ci.id]: e.target.value }))}
                              placeholder="Add research note for this collection item..."
                              className="min-h-8 flex-1 rounded border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void merged.coordinator.updateCollectionItemNote(activeCollection.id, ci.itemKey, currentNote);
                                setStatusBanner("Saved item note to outbox.");
                              }}
                              className="min-h-8 rounded border border-[var(--border)] px-2.5 text-[11px] font-bold hover:border-[var(--primary)]"
                            >
                              Save Note
                            </button>
                          </div>

                          {otherCols.length > 0 && (
                            <div className="flex items-center gap-1.5 sm:col-span-5">
                              <select
                                aria-label="Target collection for move or copy"
                                value={targetCol}
                                onChange={(e) => setMoveTargets((prev) => ({ ...prev, [ci.id]: e.target.value }))}
                                className="min-h-8 flex-1 rounded border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-[11px] font-semibold"
                              >
                                <option value="">Target collection...</option>
                                {otherCols.map((oc) => (
                                  <option key={oc.id} value={oc.id}>{oc.name}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!targetCol}
                                onClick={() => {
                                  void merged.coordinator.moveOrCopyCollectionItem({
                                    sourceCollectionId: activeCollection.id,
                                    targetCollectionId: targetCol,
                                    itemKey: ci.itemKey,
                                    mode: "copy",
                                  });
                                  setStatusBanner("Copied item to target collection.");
                                }}
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-[var(--border)] px-2 text-[11px] font-bold disabled:opacity-40"
                              >
                                <CopyPlus className="h-3 w-3" aria-hidden="true" /> Copy
                              </button>
                              <button
                                type="button"
                                disabled={!targetCol}
                                onClick={() => {
                                  void merged.coordinator.moveOrCopyCollectionItem({
                                    sourceCollectionId: activeCollection.id,
                                    targetCollectionId: targetCol,
                                    itemKey: ci.itemKey,
                                    mode: "move",
                                  });
                                  setStatusBanner("Moved item to target collection.");
                                }}
                                className="inline-flex min-h-8 items-center gap-1 rounded border border-[var(--border)] px-2 text-[11px] font-bold disabled:opacity-40"
                              >
                                <ArrowRightLeft className="h-3 w-3" aria-hidden="true" /> Move
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <RawJsonDrawer
        open={rawTarget !== null}
        title={rawTarget?.title ?? ""}
        payload={rawTarget?.payload}
        onClose={() => setRawTarget(null)}
      />
    </div>
  );
}
