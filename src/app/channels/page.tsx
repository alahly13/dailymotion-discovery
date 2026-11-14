import Link from "next/link";
import { ArrowRight, Database, History, Play, RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { channelDatabasePersistenceMode, listPersistedChannelSources } from "@/lib/repositories/channel-fetch-persistence";
import type { ChannelSourceSummary } from "@/types/channel-fetch";

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unknown";
  return numberFormatter.format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function sourceName(source: ChannelSourceSummary) {
  return source.displayName ?? source.username ?? source.handle ?? source.externalSourceId;
}

function fetchLabel(source: ChannelSourceSummary) {
  if (source.latestAttemptStatus === "running" || source.latestAttemptStatus === "pending") return "Fetching...";
  if (source.latestResumableAttemptId) return "Resume Fetch";
  if (source.coverageStatus === "complete") return "Refresh / Re-check Channel";
  return source.totalAttempts > 0 ? "Continue Fetch" : "Start Fetch";
}

function explorerHref(source: ChannelSourceSummary) {
  const params = new URLSearchParams({ url: source.sourceInput });
  if (source.latestResumableAttemptId) params.set("resumeJobId", source.latestResumableAttemptId);
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

function StatusBadge({ status }: { status: string }) {
  const tone = status === "complete"
    ? "border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]"
    : status === "failed" || status === "stopped"
      ? "border-[color-mix(in_srgb,var(--error)_32%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--error)]"
      : "border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]";
  return <span className={`metadata-chip rounded-md border px-2 py-1 text-[11px] font-black uppercase ${tone}`}>{status}</span>;
}

export default async function ChannelsPage() {
  // This page is intentionally dynamic because it reads the persisted channel
  // catalog through Prisma. Future agents should not make this static; that
  // would move DB access into the Next build and break Vercel-safe deployments.
  const [sources, persistence] = await Promise.all([
    listPersistedChannelSources(100),
    Promise.resolve(channelDatabasePersistenceMode()),
  ]);

  return (
    <div className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Saved Channel History</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight sm:text-5xl">Persisted sources and combined manifests.</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
            These channels come from DB-backed Channel Explorer history. Search and filter surfaces use saved public metadata only.
          </p>
        </div>
        <Link href="/link-explorer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-center text-sm font-black text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
          <Play className="h-4 w-4" aria-hidden="true" />
          Link Explorer
        </Link>
      </section>

      <div className="panel-muted p-4 text-sm leading-6 text-[var(--muted-foreground)]">
        Persistence mode: <span className="font-black text-[var(--foreground)]">{persistence}</span>. Combined manifests are source-level catalogs; attempts remain visible separately for audit and resume decisions.
      </div>

      {sources.length === 0 ? (
        <Card className="space-y-4">
          <Database className="h-7 w-7 text-[var(--primary)]" aria-hidden="true" />
          <h2 className="text-xl font-black">No saved channel attempts yet</h2>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">Analyze a public Dailymotion source, start a fetch, and stop or complete at least one chunk to populate persisted history here.</p>
          <Link href="/link-explorer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
            Start Explore
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Card>
      ) : (
        <div className="grid gap-5">
          {sources.map((source) => (
            <Card key={source.id} className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[auto_1fr_auto] xl:items-start">
                <div className="h-20 w-20 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-container-high)]">
                  {source.avatarUrl || source.thumbnailUrl ? (
                    <img src={source.avatarUrl ?? source.thumbnailUrl ?? ""} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-black text-[var(--muted-foreground)]">{sourceName(source).slice(0, 1).toUpperCase()}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="text-anywhere min-w-0 flex-1 text-2xl font-black">{sourceName(source)}</h2>
                    <StatusBadge status={source.coverageStatus} />
                  </div>
                  <p className="text-anywhere mt-1 text-sm text-[var(--muted-foreground)]">{source.handle ?? source.username ?? source.canonicalUrl ?? source.sourceInput}</p>
                  <div className="chip-row mt-3 text-[11px] font-black uppercase text-[var(--muted-foreground)]">
                    <span className="metadata-chip rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1">{source.sourceType}</span>
                    <span className="metadata-chip rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1">Source ID: {source.externalSourceId}</span>
                    <span className="metadata-chip rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1">{source.coverageConfidence} confidence</span>
                  </div>
                </div>
                <div className="action-row xl:justify-end">
                  <Link href={`/channels/${source.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-center text-sm font-black text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
                    Open
                  </Link>
                  <Link href={`/channels/${source.id}#attempts`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-center text-sm font-bold transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
                    <History className="h-4 w-4" aria-hidden="true" />
                    Attempts
                  </Link>
                  <Link href={explorerHref(source)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-center text-sm font-bold transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    {fetchLabel(source)}
                  </Link>
                </div>
              </div>
              <div className="metric-grid">
                <Stat label="Reported total" value={formatNumber(source.reportedTotalFromApi)} />
                <Stat label="Collected unique" value={formatNumber(source.collectedUniqueVideos)} />
                <Stat label="Estimated remaining" value={formatNumber(source.estimatedRemainingVideos)} />
                <Stat label="Coverage" value={source.coveragePercent === null ? "Unknown" : `${source.coveragePercent}%`} />
                <Stat label="Attempts" value={String(source.totalAttempts)} />
                <Stat label="Latest fetch" value={source.latestAttemptNumber ? `#${source.latestAttemptNumber} ${source.latestAttemptStatus ?? ""}` : "None"} />
                <Stat label="Last fetch time" value={formatDate(source.lastFetchTime)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
