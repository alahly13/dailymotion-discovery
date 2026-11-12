"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bot, FileSearch, Play, Sparkles, WandSparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResultCard } from "@/components/discovery/result-card";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import type { AiParsedQueryPlan } from "@/lib/ai/ai-schemas";
import type { DiscoveryFailure, DiscoveryItem } from "@/lib/discovery/types";

const EXAMPLE_PROMPTS = [
  "Recent French technology documentaries longer than 15 minutes",
  "Popular gaming livestreams or walkthroughs in English from this month",
  "News reports from verified creators about artificial intelligence",
];

function buildV1SearchUrl(plan: AiParsedQueryPlan, page = 1): string {
  const params = new URLSearchParams();
  params.set("mode", "search");
  if (plan.searchQuery) params.set("q", plan.searchQuery);
  if (plan.channel) params.set("channel", plan.channel);
  if (plan.country) params.set("country", plan.country);
  if (plan.language) params.set("languages", plan.language);
  if (plan.tags) params.set("tags", plan.tags);
  if (plan.sort) params.set("sort", plan.sort);
  if (plan.longerThan) params.set("longerThan", String(plan.longerThan));
  if (plan.shorterThan) params.set("shorterThan", String(plan.shorterThan));
  if (plan.createdAfter) params.set("createdAfter", plan.createdAfter);
  if (plan.createdBefore) params.set("createdBefore", plan.createdBefore);
  params.set("page", String(page));
  params.set("pageSize", "20");
  return `/api/discovery/v1/general?${params.toString()}`;
}

export default function AiSearchPage() {
  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();
  const [prompt, setPrompt] = useState("");
  const [parsing, setParsing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AiParsedQueryPlan | null>(null);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryHighlights, setSummaryHighlights] = useState<string[]>([]);

  async function interpretPrompt() {
    if (!prompt.trim() || parsing) return;
    setParsing(true);
    setAiError(null);
    setSummaryText(null);
    setSummaryHighlights([]);
    try {
      const response = await fetch("/api/ai/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: prompt.trim() }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        parsed?: AiParsedQueryPlan;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.parsed) {
        setAiError(data.error ?? "AI query parsing failed.");
        return;
      }
      setPlan(data.parsed);
    } catch {
      setAiError("Network failure calling /api/ai/parse-query.");
    } finally {
      setParsing(false);
    }
  }

  async function executeLiveSearch(targetPlan: AiParsedQueryPlan) {
    if (searching) return;
    setSearching(true);
    setSearchError(null);
    setSummaryText(null);
    workspace.recordSearchSubmitted("v1");
    try {
      const response = await fetch(buildV1SearchUrl(targetPlan));
      const data = (await response.json()) as
        | { ok: true; result: { items: DiscoveryItem[]; total: number | null } }
        | DiscoveryFailure;
      if (!data.ok) {
        setSearchError(data.error);
        setItems([]);
        workspace.recordSearchOutcome("v1", false, 1);
        return;
      }
      setItems(data.result.items);
      workspace.recordSearchOutcome("v1", true, 1);
      workspace.addHistory({
        version: "v1",
        resource: "general",
        label: `AI V1: ${targetPlan.searchQuery}`,
        params: {
          q: targetPlan.searchQuery,
          ...(targetPlan.channel ? { channel: targetPlan.channel } : {}),
          ...(targetPlan.language ? { languages: targetPlan.language } : {}),
          ...(targetPlan.sort ? { sort: targetPlan.sort } : {}),
        },
        resultCount: data.result.total ?? data.result.items.length,
      });
    } catch {
      setSearchError("Network error while querying Dailymotion API v1.");
      workspace.recordSearchOutcome("v1", false, 1);
    } finally {
      setSearching(false);
    }
  }

  async function summarizeCurrentResults() {
    if (items.length === 0 || summarizing) return;
    setSummarizing(true);
    setAiError(null);
    try {
      const snapshot = items.slice(0, 40).map((item) => ({
        id: item.id,
        title: item.title,
        duration: item.duration,
        views: item.views,
        language: item.language,
        category: item.category,
        createdAt: item.createdAt,
        owner: item.ownerName,
      }));
      const response = await fetch("/api/ai/summarize-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: { itemCount: items.length, sample: snapshot } }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        summary?: string;
        highlights?: string[];
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setAiError(data.error ?? "AI summary failed.");
        return;
      }
      setSummaryText(data.summary ?? null);
      setSummaryHighlights(data.highlights ?? []);
    } catch {
      setAiError("Network failure calling /api/ai/summarize-manifest.");
    } finally {
      setSummarizing(false);
    }
  }

  const unifiedSearchHref = plan
    ? `/search?${new URLSearchParams({
        v: "v1",
        q: plan.searchQuery,
        ...(plan.language ? { languages: plan.language } : {}),
        ...(plan.country ? { country: plan.country } : {}),
        ...(plan.channel ? { channel: plan.channel } : {}),
        ...(plan.sort ? { sort: plan.sort } : {}),
      }).toString()}`
    : "/search";

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">AI Search</p>
        <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Gemini-Assisted Discovery</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
          Translate natural-language discovery requests into real Dailymotion API v1 queries, run live metadata fetches, and summarize real returned items via Gemini 2.5 Flash.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.55fr_0.45fr]">
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
              <WandSparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">Prompt Workspace</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Describe topic, language, duration, timeframe, or category in plain words.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1 text-left text-xs font-semibold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                {example}
              </button>
            ))}
          </div>

          <textarea
            className="min-h-36 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-4 text-sm outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--ring)]"
            placeholder="e.g. 'French documentaries on renewable energy uploaded in 2026 longer than 15 minutes'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void interpretPrompt()} disabled={parsing || !prompt.trim()}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {parsing ? "Interpreting..." : "Interpret with AI"}
            </Button>
            {plan ? (
              <Button type="button" variant="secondary" onClick={() => void executeLiveSearch(plan)} disabled={searching}>
                <Play className="h-4 w-4" aria-hidden="true" />
                {searching ? "Searching Dailymotion..." : "Run Parsed V1 Search"}
              </Button>
            ) : null}
          </div>

          {aiError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
              <p className="font-semibold">{aiError}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Configure <code>GEMINI_API_KEY</code> in your server <code>.env</code> or run direct queries on{" "}
                <Link href="/search" className="font-bold text-[var(--primary)] hover:underline">
                  /search
                </Link>
                .
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--info)_12%,transparent)] text-[var(--info)]">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">Structured Query Plan</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Inspect every parameter before calling the Dailymotion API v1 endpoint.
              </p>
            </div>
          </div>

          {!plan ? (
            <div className="flex min-h-52 flex-col justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-container-low)] p-6 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-[var(--primary)]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-black">Waiting for prompt interpretation</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                AI output converts your request into structured search parameters and never invents videos.
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-4 text-sm">
              <p className="leading-6">{plan.explanation}</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-[var(--primary)]/15 px-2.5 py-1 text-xs font-black text-[var(--primary)]">
                  q: {plan.searchQuery}
                </span>
                {plan.channel ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">channel: {plan.channel}</span> : null}
                {plan.language ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">lang: {plan.language}</span> : null}
                {plan.country ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">country: {plan.country}</span> : null}
                {plan.sort ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">sort: {plan.sort}</span> : null}
                {plan.longerThan ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">&ge; {plan.longerThan}m</span> : null}
                {plan.shorterThan ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">&le; {plan.shorterThan}m</span> : null}
                {plan.createdAfter ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">from: {plan.createdAfter}</span> : null}
                {plan.createdBefore ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">to: {plan.createdBefore}</span> : null}
                {plan.tags ? <span className="rounded bg-[var(--card)] px-2.5 py-1 text-xs font-bold">tags: {plan.tags}</span> : null}
              </div>
              {plan.warnings.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-amber-600">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <Link href={unifiedSearchHref} className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-[var(--primary)] hover:underline">
                Open in Unified Search
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </Card>
      </div>

      {searchError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold" role="alert">
          Live Dailymotion search failed: {searchError}
        </div>
      ) : null}

      {items.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">Live Dailymotion V1 Results ({items.length})</h2>
            <Button type="button" variant="secondary" onClick={() => void summarizeCurrentResults()} disabled={summarizing}>
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              {summarizing ? "Summarizing..." : "Summarize Results with AI"}
            </Button>
          </div>

          {summaryText ? (
            <Card className="space-y-3 bg-[var(--surface-container-low)]">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Grounded Result Summary</p>
              <p className="text-sm leading-6">{summaryText}</p>
              {summaryHighlights.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--muted-foreground)]">
                  {summaryHighlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const cKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
              const isSaved = merged.savedKeys.has(cKey) || workspace.isItemSaved(item.apiVersion, item.kind, item.id);
              return (
                <ResultCard
                  key={cKey}
                  item={item}
                  saved={isSaved}
                  favorite={merged.favoriteKeys.has(cKey)}
                  collections={merged.collections.map((c) => ({ id: c.id, name: c.name }))}
                  onToggleFavorite={() => {
                    if (!isSaved) {
                      void merged.coordinator.toggleSaveItem(item).then(() =>
                        merged.coordinator.setSavedItemFavorite(cKey, true)
                      );
                    } else {
                      void merged.coordinator.setSavedItemFavorite(cKey, !merged.favoriteKeys.has(cKey));
                    }
                  }}
                  onAddToCollection={(colId) => void merged.coordinator.addItemToCollection(colId, item)}
                  onToggleSave={() => {
                    void merged.coordinator.toggleSaveItem(item);
                    if (workspace.isItemSaved(item.apiVersion, item.kind, item.id)) {
                      workspace.removeItem(item.apiVersion, item.kind, item.id);
                    } else {
                      workspace.saveItem(item);
                    }
                  }}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
