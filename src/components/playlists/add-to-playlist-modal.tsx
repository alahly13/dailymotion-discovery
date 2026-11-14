/**
 * Add To Playlist Dialog / Modal (2026)
 *
 * What this controls:
 * 1. Accessible "Add to Playlist" action for any discovery result card.
 * 2. Supports all resource types (Videos, Channels, Users, Playlists, Livestreams).
 * 3. Lets the user select an existing playlist OR create a new playlist on the fly
 *    without leaving the search workspace.
 * 4. Checks for accidental duplicates inside the target playlist.
 * 5. Provides clear immediate confirmation of addition.
 *
 * Scope: Global Search, Link Explorer, Saved Library, and Discovery views.
 */

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Folder, ListPlus, Loader2, Plus, Sparkles, X } from "lucide-react";
import type { DiscoveryItem } from "@/lib/discovery/types";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";

interface Props {
  item: DiscoveryItem;
  triggerButton?: (onClick: () => void) => React.ReactNode;
  onAdded?: (playlistName: string) => void;
}

export function AddToPlaylistModal({ item, triggerButton, onAdded }: Props) {
  const merged = useMergedDataset();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const itemCompositeKey = useMemo(
    () => discoveryCompositeKey(item.apiVersion, item.kind, item.id),
    [item.apiVersion, item.kind, item.id]
  );

  // Map of which playlists already contain this item (to prevent duplicate additions)
  const existingPlaylistMemberships = useMemo(() => {
    const set = new Set<string>();
    for (const ci of merged.collectionItems) {
      if (ci.itemKey === itemCompositeKey || (ci.snapshot.id === item.id && ci.snapshot.kind === item.kind)) {
        set.add(ci.collectionId);
      }
    }
    return set;
  }, [merged.collectionItems, itemCompositeKey, item.id, item.kind]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Set default selected playlist when modal opens
  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setErrorMessage(null);
      if (merged.collections.length > 0) {
        // Find first playlist that doesn't already contain this item
        const available = merged.collections.find((c) => !existingPlaylistMemberships.has(c.id));
        setSelectedPlaylistId(available ? available.id : merged.collections[0].id);
      } else {
        setShowCreateForm(true);
      }
    }
  }, [isOpen, merged.collections, existingPlaylistMemberships]);

  const handleAddToExisting = async () => {
    if (!selectedPlaylistId) return;
    if (existingPlaylistMemberships.has(selectedPlaylistId)) {
      setErrorMessage("This resource is already in the selected playlist.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await merged.coordinator.addItemToCollection(selectedPlaylistId, item);
      const playlist = merged.collections.find((c) => c.id === selectedPlaylistId);
      const name = playlist ? playlist.name : "Playlist";
      setSuccessMessage(`Added to "${name}"!`);
      onAdded?.(name);
      setTimeout(() => {
        setIsOpen(false);
      }, 1200);
    } catch (err) {
      setErrorMessage("Failed to add resource to playlist.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) {
      setErrorMessage("Please enter a playlist name.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await merged.coordinator.createCollection({
        name: newPlaylistName.trim(),
        description: newPlaylistDesc.trim() || undefined,
      });

      await merged.coordinator.addItemToCollection(created.id, item);

      setSuccessMessage(`Created "${created.name}" and added resource!`);
      onAdded?.(created.name);
      setNewPlaylistName("");
      setNewPlaylistDesc("");
      setTimeout(() => {
        setIsOpen(false);
      }, 1200);
    } catch (err) {
      setErrorMessage("Failed to create playlist.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {triggerButton ? (
        triggerButton(() => setIsOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--foreground)] hover:border-primary hover:text-primary transition cursor-pointer"
          title="Add to application-managed playlist"
        >
          <ListPlus className="h-3.5 w-3.5" />
          <span>+ Playlist</span>
        </button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0"
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl text-[var(--foreground)] animate-in zoom-in-95"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListPlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 id={titleId} className="text-sm font-black">
                    Add to Playlist
                  </h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Application-managed personal playlist
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Resource Preview Snippet */}
            <div className="my-3 flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-2.5">
              {item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail}
                  alt=""
                  className="h-10 w-16 rounded object-cover shrink-0"
                />
              ) : (
                <div className="flex h-10 w-16 items-center justify-center rounded bg-[var(--surface-container-high)] text-[var(--muted-foreground)] shrink-0">
                  <Folder className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{item.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] font-mono">
                  <span className="uppercase font-bold text-primary">{item.kind}</span>
                  <span>•</span>
                  <span>{item.apiVersion.toUpperCase()}</span>
                  {item.ownerName && (
                    <>
                      <span>•</span>
                      <span className="truncate">{item.ownerName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notifications */}
            {successMessage && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-500/30 p-2.5 text-xs font-bold text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Existing Playlists Selector */}
            {!showCreateForm ? (
              <div className="space-y-3">
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                    Select Playlist:
                  </label>
                  {merged.collections.length === 0 ? (
                    <p className="text-xs text-[var(--muted-foreground)] py-2 text-center">
                      No playlists created yet.
                    </p>
                  ) : (
                    merged.collections.map((col) => {
                      const alreadyIn = existingPlaylistMemberships.has(col.id);
                      return (
                        <label
                          key={col.id}
                          className={`flex items-center justify-between rounded-lg border p-2 text-xs cursor-pointer transition ${
                            selectedPlaylistId === col.id
                              ? "border-primary bg-primary/10 font-bold"
                              : "border-[var(--border)] bg-[var(--surface-container-low)] hover:border-[var(--border-strong)]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="radio"
                              name="playlist_selection"
                              value={col.id}
                              checked={selectedPlaylistId === col.id}
                              onChange={() => setSelectedPlaylistId(col.id)}
                              className="accent-primary"
                            />
                            <span className="truncate">{col.name}</span>
                          </div>
                          {alreadyIn && (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                              ✓ In playlist
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create New Playlist</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="min-h-8 rounded-lg border border-[var(--border)] px-3 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !selectedPlaylistId}
                      onClick={() => void handleAddToExisting()}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Inline Create Playlist Form */
              <form onSubmit={(e) => void handleCreateAndAdd(e)} className="space-y-3 pt-1">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                    New Playlist Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="e.g. Breaking News 2026, Arabic Documentaries"
                    className="min-h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={newPlaylistDesc}
                    onChange={(e) => setNewPlaylistDesc(e.target.value)}
                    placeholder="Brief description of this playlist..."
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-2.5 text-xs font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  {merged.collections.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      ← Back to list
                    </button>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="min-h-8 rounded-lg border border-[var(--border)] px-3 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !newPlaylistName.trim()}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      <span>Create & Add</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
