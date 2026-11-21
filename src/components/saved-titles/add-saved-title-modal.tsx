"use client";

import { useState } from "react";
import { Plus, RotateCw, X, AlertCircle } from "lucide-react";
import { saveLocalSavedTitle } from "@/lib/saved-titles/local-storage";
import { analyzeDailymotionUrlOrId } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import type { SavedTitleEntry, SavedTitleKind } from "@/lib/saved-titles/types";

interface AddSavedTitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entry: SavedTitleEntry) => void;
}

export function AddSavedTitleModal({ isOpen, onClose, onCreated }: AddSavedTitleModalProps) {
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = input.trim();
    if (!cleanInput) {
      setError("Please enter a title, search term, URL, or identifier.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Submit to server endpoint to obtain server-verified addedBy identity (administrator or user)
      let createdEntry: SavedTitleEntry | null = null;
      try {
        const res = await fetch("/api/saved-titles/create-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: cleanInput,
            notes: notes.trim(),
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; entry?: SavedTitleEntry; error?: string };
          if (data.ok && data.entry) {
            createdEntry = data.entry;
          }
        }
      } catch {
        // Network unavailable: proceed to local-first browser storage fallback below
      }

      // 2. If server was unreachable or in offline mode, construct resilient local-first entry
      if (!createdEntry) {
        const parsed = analyzeDailymotionUrlOrId(cleanInput);
        let detectedKind: SavedTitleKind = "text_reference";
        if (cleanInput.startsWith("http://") || cleanInput.startsWith("https://") || cleanInput.startsWith("dai.ly")) {
          detectedKind = "url";
        } else if (cleanInput.startsWith("@") || cleanInput.startsWith("channel:")) {
          detectedKind = "handle";
        } else if (/^[a-zA-Z0-9_-]{5,}$/.test(cleanInput)) {
          detectedKind = "resource_id";
        } else if (parsed.kind === "search") {
          detectedKind = "search_query";
        }

        const resourceType = parsed.kind === "unsupported" || parsed.kind === "search" ? null : parsed.kind;
        const now = new Date().toISOString();
        const rand = Math.random().toString(36).slice(2, 8);
        createdEntry = {
          id: `st_man_${Date.now().toString(36)}_${rand}`,
          ownerId: "local-owner",
          kind: detectedKind,
          value: cleanInput,
          displayTitle: parsed.displayLabel || cleanInput,
          source: {
            workspace: "admin-manual",
            label: "Local Manual",
            apiVersion: null,
            resourceType,
          },
          addedBy: {
            type: "user-manual",
          },
          createdAt: now,
          updatedAt: now,
          resourceType,
          canonicalUrl: parsed.canonicalUrl || null,
          notes: notes.trim() || null,
          status: "pending_sync",
        };
      }

      // 3. Persist immediately into owner's local IndexedDB with "pending_sync" status
      await saveLocalSavedTitle(createdEntry);

      onCreated(createdEntry);
      setInput("");
      setNotes("");
      onClose();
    } catch (saveErr) {
      setError(saveErr instanceof Error ? saveErr.message : "Failed to save title to local storage.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">Add Saved Title</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Manually record a search query, Dailymotion URL, channel handle, or resource ID
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

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Title / URL / ID / Search Query
            </label>
            <input
              type="text"
              required
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. molecular biology or https://dai.ly/x8n8x8 or @lemonde"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Optional Notes / Research Context
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this reference was saved or what it is related to..."
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
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save to Local</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
