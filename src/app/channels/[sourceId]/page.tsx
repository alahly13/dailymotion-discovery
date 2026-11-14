import Link from "next/link";
import { ArrowLeft, ExternalLink, History, Play } from "lucide-react";
import { SavedChannelManifestBrowser } from "@/components/channel-history/saved-channel-manifest-browser";
import { Card } from "@/components/ui/card";
import { getPersistedCombinedChannelManifestPage } from "@/lib/repositories/channel-fetch-persistence";
import type { SavedChannelSort } from "@/types/channel-fetch";

export const dynamic = "force-dynamic";

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sortParam(value: string): SavedChannelSort {
  if (value === "newest" || value === "oldest" || value === "views_desc" || value === "duration_desc" || value === "title_asc") return value;
  return "first_collected";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unavailable" : date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unknown";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function sourceName(source: NonNullable<Awaited<ReturnType<typeof getPersistedCombinedChannelManifestPage>>["source"]>) {
  return source.displayName ?? source.username ?? source.handle ?? source.externalSourceId;
}

function explorerHref(sourceInput: string, resumeJobId?: string | null) {
  const params = new URLSearchParams({ url: sourceInput });
  if (resumeJobId) params.set("resumeJobId", resumeJobId);
  return `/link-explorer?${params.toString()}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

export default async function ChannelSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sourceId } = await params;
  const queryParams = await searchParams;
  const query = param(queryParams.query);
  const limit = Number(param(queryParams.limit) || 48);
  const offset = Number(param(queryParams.offset) || 0);
  const sort = sortParam(param(queryParams.sort));
  const exactPhrase = param(queryParams.exactPhrase) === "true";
  const result = await getPersistedCombinedChannelManifestPage({ sourceId, query, limit, offset, sort, exactPhrase });
  const source = result.source;

  if (!source) {
    return (
      <div className="space-y-5">
        <Link href="/channels" className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to channels
        </Link>
        <Card>
          <h1 className="text-2xl font-black">Channel source not found</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">No persisted Dailymotion fetch history exists for this source ID.</p>
        </Card>
      </div>
    );
  }

  const incomplete = source.coverageStatus !== "complete";
  const displayName = sourceName(source);

  return (
    <div className="space-y-8">
      <Link href="/channels" className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to channels
      </Link>

      <section className="grid gap-5 xl:grid-cols-[auto_1fr_auto] xl:items-start">
        <div className="h-24 w-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-container-high)]">
          {source.avatarUrl || source.thumbnailUrl ? (
            <img src={source.avatarUrl ?? source.thumbnailUrl ?? ""} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-black text-[var(--muted-foreground)]">{displayName.slice(0, 1).toUpperCase()}</div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Combined Channel Manifest</p>
          <h1 className="text-anywhere line-clamp-2 text-4xl font-black leading-tight sm:text-5xl">{displayName}</h1>
          <p className="text-anywhere max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{source.canonicalUrl ?? source.sourceInput}</p>
          <div className="chip-row text-[11px] font-black uppercase text-[var(--muted-foreground)]">
            <span className="metadata-chip rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1">{source.sourceType}</span>
            <span className="metadata-chip rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1">Source ID: {source.externalSourceId}</span>
            <span className="metadata-chip rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1">Manifest: {source.combinedManifestId ?? "missing"}</span>
          </div>
        </div>
        <div className="action-row xl:justify-end">
          <Link href={explorerHref(source.sourceInput, source.latestResumableAttemptId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-center text-sm font-black text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
            <Play className="h-4 w-4" aria-hidden="true" />
            {source.latestResumableAttemptId ? "Resume Fetch" : incomplete ? "Continue Fetch" : "Refresh / Re-check Channel"}
          </Link>
          {source.canonicalUrl ? (
            <Link href={source.canonicalUrl} target="_blank" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-center text-sm font-bold transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Public Source
            </Link>
          ) : null}
        </div>
      </section>

      <div className="metric-grid">
        <Stat label="Reported total" value={formatNumber(source.reportedTotalFromApi)} />
        <Stat label="Unique collected" value={formatNumber(source.collectedUniqueVideos)} />
        <Stat label="Estimated remaining" value={formatNumber(source.estimatedRemainingVideos)} />
        <Stat label="Coverage" value={source.coveragePercent === null ? "Unknown" : `${source.coveragePercent}%`} />
        <Stat label="Coverage status" value={`${source.coverageStatus} / ${source.coverageConfidence}`} />
        <Stat label="Attempts" value={String(source.totalAttempts)} />
        <Stat label="Last fetch" value={formatDate(source.lastFetchTime)} />
      </div>

      <SavedChannelManifestBrowser
        source={source}
        coverage={result.coverage}
        history={result.history}
        initialItems={result.items}
        initialTotal={result.total}
        initialLimit={result.limit}
        initialOffset={result.offset}
        initialSort={result.sort}
      />

      <section id="attempts" className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black">
            <History className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            Fetch Attempts
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Each attempt keeps its own manifest, windows, pages, duplicate count, and resume checkpoint.</p>
        </div>
        <div className="grid gap-3">
          {result.history.map((entry) => (
            <Link key={entry.id} href={`/channels/${source.id}/attempts/${entry.id}`} className="grid min-w-0 gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)] transition hover:border-[var(--primary)] 2xl:grid-cols-[minmax(0,1fr)_auto]">
              <div className="metric-grid">
                <Stat label="Attempt" value={`#${entry.attemptNumber}`} />
                <Stat label="Status" value={`${entry.status} / ${entry.completenessStatus}`} />
                <Stat label="Profile" value={entry.fetchProfile} />
                <Stat label="Unique / duplicates" value={`${entry.uniqueItemsCollected} / ${entry.duplicateCount}`} />
                <Stat label="Updated" value={formatDate(entry.updatedAt)} />
              </div>
              <span className="inline-flex items-center gap-2 self-center text-sm font-black text-[var(--primary)]">Open detail <ExternalLink className="h-4 w-4" aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
