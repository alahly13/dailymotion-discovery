"use client";

import { useState, useEffect } from "react";
import { Pencil, RotateCw, X } from "lucide-react";
import { updateLocalSavedTitle } from "@/lib/saved-titles/local-storage";
import type { SavedTitleEntry } from "@/lib/saved-titles/types";

interface EditSavedTitleModalProps {
  entry: SavedTitleEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (entry: SavedTitleEntry) => void;
}

export function EditSavedTitleModal({ entry, isOpen, onClose, onUpdated }: EditSavedTitleModalProps) {
  const [displayTitle, setDisplayTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entry) {
      setDisplayTitle(entry.displayTitle || entry.value);
      setNotes(entry.notes || "");
    }
  }, [entry]);

  if (!isOpen || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updated = await updateLocalSavedTitle(entry.ownerId, entry.id, {
        displayTitle: displayTitle.trim() || entry.value,
        notes: notes.trim() || null,
      });

      if (updated) {
        onUpdated(updated);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] flex items-center justify-center">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">Edit Saved Title</h2>
              <p className="text-xs text-[var(--muted-foreground)] truncate max-w-[280px]">
                Original input: {entry.value}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Display Title
            </label>
            <input
              type="text"
              required
              value={displayTitle}
              onChange={(e) => setDisplayTitle(e.target.value)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-4 py-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? (
                <>
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
