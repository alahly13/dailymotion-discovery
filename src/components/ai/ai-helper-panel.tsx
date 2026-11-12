"use client";

import { useState } from "react";
import { Bot, Check, ShieldCheck, Sparkles } from "lucide-react";
import type { AdvancedVideoFilters } from "@/types/filters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface AiHelperPanelProps {
  manifestSummary?: unknown;
  onApplyFilters?: (filters: AdvancedVideoFilters) => void;
}

export function AiHelperPanel({ manifestSummary, onApplyFilters }: AiHelperPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [loadingMode, setLoadingMode] = useState<"filter" | "summarize" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [suggestedFilters, setSuggestedFilters] = useState<AdvancedVideoFilters | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const hasManifest = Boolean(manifestSummary);

  async function suggestFilters() {
    if (!hasManifest || loadingMode) return;
    setLoadingMode("filter");
    setError(null);
    try {
      const response = await fetch("/api/ai/filter-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim() || "Suggest practical filters for high-signal results in this manifest.",
          manifestSummary,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        filters?: AdvancedVideoFilters;
        explanation?: string;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "AI filter helper request failed.");
        return;
      }
      setSuggestedFilters(data.filters ?? {});
      setSummaryText(data.explanation ?? null);
      setWarnings(data.warnings ?? []);
      setHighlights([]);
    } catch {
      setError("Network failure calling /api/ai/filter-helper.");
    } finally {
      setLoadingMode(null);
    }
  }

  async function summarizeManifest() {
    if (!hasManifest || loadingMode) return;
    setLoadingMode("summarize");
    setError(null);
    try {
      const response = await fetch("/api/ai/summarize-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: manifestSummary }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        summary?: string;
        highlights?: string[];
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "AI manifest summary failed.");
        return;
      }
      setSummaryText(data.summary ?? null);
      setHighlights(data.highlights ?? []);
      setSuggestedFilters(null);
      setWarnings([]);
    } catch {
      setError("Network failure calling /api/ai/summarize-manifest.");
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--muted-foreground)]">AI Helper</p>
          <h2 className="mt-1 text-xl font-black">Gemini AI Helper</h2>
        </div>
      </div>

      <p className="text-sm leading-6 text-[var(--muted-foreground)]">
        Analyze the currently loaded manifest for smart filter suggestions or grounded summaries via server Gemini routes.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder={hasManifest ? "Filter instruction (e.g. 'long tech videos with high views')..." : "Analyze or load a channel manifest first..."}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={!hasManifest || loadingMode !== null}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void suggestFilters()} disabled={!hasManifest || loadingMode !== null}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {loadingMode === "filter" ? "Thinking..." : "Suggest Filters"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void summarizeManifest()} disabled={!hasManifest || loadingMode !== null}>
            {loadingMode === "summarize" ? "Summarizing..." : "Summarize Manifest"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-6 text-[var(--foreground)]" role="alert">
          {error}
        </div>
      ) : null}

      {summaryText ? (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-4 text-sm">
          <p className="leading-6">{summaryText}</p>
          {highlights.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--muted-foreground)]">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-600">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {suggestedFilters && Object.keys(suggestedFilters).length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <code className="rounded bg-[var(--card)] px-2 py-1 text-xs">{JSON.stringify(suggestedFilters)}</code>
              {onApplyFilters ? (
                <Button type="button" onClick={() => onApplyFilters(suggestedFilters)}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Apply Suggested Filters
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel-muted flex items-start gap-3 p-3 text-sm leading-6 text-[var(--muted-foreground)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
        AI responses stay strictly grounded in real metadata already collected in the loaded manifest.
      </div>
    </Card>
  );
}
