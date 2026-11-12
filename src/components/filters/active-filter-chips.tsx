"use client";

import { X } from "lucide-react";
import type { AdvancedVideoFilters } from "@/types/filters";
import { defaultAdvancedVideoFilters } from "@/lib/filters/filter-types";

interface ActiveFilterChipsProps {
  filters: AdvancedVideoFilters;
  onRemove?: (key: keyof AdvancedVideoFilters) => void;
  onReset?: () => void;
}

export function ActiveFilterChips({ filters, onRemove, onReset }: ActiveFilterChipsProps) {
  const entries = Object.entries(filters).filter(([key, value]) => {
    const defaultValue = defaultAdvancedVideoFilters[key as keyof typeof defaultAdvancedVideoFilters];
    if (value === null || value === undefined || value === "") return false;
    return value !== defaultValue;
  });
  if (entries.length === 0) return null;

  return (
    <div className="chip-row flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3">
      {entries.map(([key, value]) => {
        const typedKey = key as keyof AdvancedVideoFilters;
        return (
          <span
            key={key}
            className="metadata-chip inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-black text-[var(--foreground)]"
          >
            <span>
              {key}: {String(value)}
            </span>
            {onRemove ? (
              <button
                type="button"
                aria-label={`Remove ${key} filter`}
                onClick={() => onRemove(typedKey)}
                className="rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        );
      })}
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-black uppercase text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
