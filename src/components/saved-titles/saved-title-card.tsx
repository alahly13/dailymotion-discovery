"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  CloudCheck,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  FolderOpen,
  Globe,
  Hash,
  Link as LinkIcon,
  Pencil,
  Search,
  Shield,
  Trash2,
  Tv,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SavedTitleEntry } from "@/lib/saved-titles/types";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";

interface SavedTitleCardProps {
  entry: SavedTitleEntry;
  onEdit?: (entry: SavedTitleEntry) => void;
  onDelete?: (entry: SavedTitleEntry) => void;
}

export function SavedTitleCard({ entry, onEdit, onDelete }: SavedTitleCardProps) {
  const [copied, setCopied] = useState(false);
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(entry.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build inspect destination URL
  let inspectUrl: string | null = null;
  if (entry.kind === "search_query") {
    const v = entry.source.apiVersion === "v2" ? "v2" : "v1";
    inspectUrl = `/global-search?q=${encodeURIComponent(entry.value)}&v=${v}`;
  } else if (entry.kind === "url" || entry.kind === "resource_id" || entry.kind === "handle") {
    const v = entry.source.apiVersion === "v2" ? "v2" : "v1";
    inspectUrl = `/link-explorer?url=${encodeURIComponent(entry.canonicalUrl || entry.value)}&v=${v}`;
  }

  // Kind icon
  const renderKindIcon = () => {
    switch (entry.kind) {
      case "search_query":
        return <Search className="h-3.5 w-3.5 text-teal-500" />;
      case "url":
        return <Globe className="h-3.5 w-3.5 text-sky-500" />;
      case "resource_id":
        return <Hash className="h-3.5 w-3.5 text-purple-500" />;
      case "handle":
        return <User className="h-3.5 w-3.5 text-emerald-500" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  const isCloud = entry.status === "cloud_synced";
  const isAdminAdded = entry.addedBy.type === "administrator";

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200",
          isCloud
            ? "border-emerald-500/20 bg-[var(--surface)] hover:border-emerald-500/40 shadow-xs"
            : "border-amber-500/30 bg-[var(--surface)]/90 hover:border-amber-500/50 shadow-xs"
        )}
      >
        <div>
          {/* Top badges bar */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Kind badge */}
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-high)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--foreground)]">
                {renderKindIcon()}
                <span>{entry.kind.replace("_", " ")}</span>
              </span>

              {/* Source workspace */}
              <span className="inline-flex items-center rounded-md border border-neutral-500/20 bg-neutral-500/10 px-2 py-0.5 text-[10px] font-bold text-[var(--muted-foreground)]">
                {entry.source.label}
              </span>

              {/* API Version badge */}
              {entry.source.apiVersion ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase",
                    entry.source.apiVersion === "v1"
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                  )}
                >
                  {entry.source.apiVersion.toUpperCase()}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                  N/A
                </span>
              )}

              {/* Added by admin badge */}
              {isAdminAdded && (
                <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-black text-purple-600 dark:text-purple-300">
                  <Shield className="h-2.5 w-2.5" />
                  <span>Added by admin</span>
                </span>
              )}
            </div>

            {/* Storage status pill */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                isCloud
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : entry.status === "upload_failed"
                  ? "border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                  : "border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isCloud ? "bg-emerald-500" : entry.status === "upload_failed" ? "bg-red-500" : "bg-amber-500 animate-pulse"
                )}
              />
              <span>
                {isCloud
                  ? "Cloud Synced"
                  : entry.status === "upload_failed"
                  ? "Upload Failed"
                  : "Pending Sync"}
              </span>
            </span>
          </div>

          {/* Title and original value */}
          <div className="space-y-1 mb-2">
            <h3 className="text-sm font-black text-[var(--foreground)] line-clamp-2 leading-snug">
              {entry.displayTitle || entry.value}
            </h3>
            {entry.displayTitle !== entry.value && (
              <p className="font-mono text-[11px] text-[var(--muted-foreground)] line-clamp-1 truncate select-all">
                {entry.value}
              </p>
            )}
          </div>

          {/* Notes if present */}
          {entry.notes && (
            <p className="text-xs text-[var(--muted-foreground)] bg-[var(--surface-container-low)] p-2 rounded-md mb-2 border border-[var(--border)]/50 italic line-clamp-2">
              &quot;{entry.notes}&quot;
            </p>
          )}

          {/* Canonical link preview */}
          {entry.canonicalUrl && (
            <a
              href={entry.canonicalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline mb-2 max-w-full truncate"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{entry.canonicalUrl}</span>
            </a>
          )}
        </div>

        {/* Card Footer: Timestamps and Actions */}
        <div className="pt-3 border-t border-[var(--border)]/70 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
            <Clock className="h-3 w-3" />
            <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Inspect button */}
            {inspectUrl && (
              <Link
                href={inspectUrl}
                title="Inspect in discovery workspace"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-[11px] font-bold text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition"
              >
                <FolderOpen className="h-3 w-3" />
                <span className="hidden sm:inline">Inspect</span>
              </Link>
            )}

            {/* Copy value */}
            <button
              type="button"
              onClick={handleCopy}
              title="Copy original input"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>

            {/* Edit button */}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(entry)}
                title="Edit title or notes"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Raw JSON */}
            <button
              type="button"
              onClick={() => setJsonDrawerOpen(true)}
              title="Inspect Raw JSON Metadata"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition cursor-pointer"
            >
              <FileCode className="h-3.5 w-3.5" />
            </button>

            {/* Delete button */}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(entry)}
                title="Remove entry"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] text-red-500/80 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Raw JSON inspection drawer */}
      {jsonDrawerOpen && (
        <RawJsonDrawer
          isOpen={jsonDrawerOpen}
          onClose={() => setJsonDrawerOpen(false)}
          title={`Saved Title: ${entry.displayTitle}`}
          payload={entry}
        />
      )}
    </>
  );
}
