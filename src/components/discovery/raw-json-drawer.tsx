"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

/**
 * Shared accessible modal/drawer for inspecting complete, untrimmed raw
 * Dailymotion API responses (v1 or v2) or manifest payloads without card layout bloat.
 * Scope: ResultCard, Saved Library, History snapshot inspector, Storage Explorer.
 */
export function RawJsonDrawer({
  open,
  title,
  subtitle,
  payload,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  payload: unknown;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const formatted = JSON.stringify(payload, null, 2);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard permission denied */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Raw JSON inspector: ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Raw Payload Inspector
            </p>
            <h2 className="mt-0.5 truncate text-base font-black text-[var(--foreground)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copyJson()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close raw JSON inspector"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-container-high)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto bg-[var(--surface-container-low)] p-4 text-xs leading-relaxed text-[var(--foreground)]">
          {formatted}
        </pre>
      </div>
    </div>
  );
}
