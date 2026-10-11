// /compare — deliberate opt-in cross-version comparison (never default).

"use client";

import { useState } from "react";
import type { DiscoveryItem } from "@/lib/discovery/types";

interface SideResult {
  ok: boolean;
  result?: { items: DiscoveryItem[]; total: number | null; endpoint: string };
  error?: string;
  reason?: string;
  remedy?: string | null;
}

interface CompareResponse {
  ok: boolean;
  v1?: SideResult;
  v2?: SideResult;
  fieldNotes?: string[];
  error?: string;
}

function Column({ title, side }: { title: string; side: SideResult | undefined }) {
  if (!side) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="font-black">{title}</h2>
      {!side.ok ? (
        <div className="mt-3 text-sm leading-6">
          <p className="font-bold text-red-500">Failed ({side.reason})</p>
          <p className="mt-1">{side.error}</p>
          {side.remedy && <p className="mt-1 font-semibold">{side.remedy}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-[var(--muted-foreground)]">
            Endpoint: <code>{side.result?.endpoint}</code> · items: {side.result?.items.length ?? 0}
            {side.result?.total !== null && side.result?.total !== undefined ? ` · reported total: ${side.result.total}` : " · total not reported"}
          </p>
          {(side.result?.items ?? []).slice(0, 10).map((item) => (
            <div key={item.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
              <p className="font-bold">{item.title}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{item.id} · {item.ownerName ?? "unknown owner"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [operation, setOperation] = useState<"video-lookup" | "profile-videos">("video-lookup");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CompareResponse | null>(null);

  async function run() {
    setLoading(true);
    setResponse(null);
    try {
      const body = operation === "video-lookup" ? { operation, id: input.trim() } : { operation, profileId: input.trim(), limit: 10 };
      const res = await fetch("/api/discovery/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setResponse((await res.json()) as CompareResponse);
    } catch {
      setResponse({ ok: false, error: "Comparison request failed (network)." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Deliberate comparison · never default</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Cross-Version Comparison</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Run the same logical operation against v1 and v2 side by side. Results are shown per version and never merged; counts are not summed.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 sm:grid-cols-[auto_1fr_auto]">
        <select value={operation} onChange={(e) => setOperation(e.target.value as typeof operation)} className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-bold" aria-label="Operation">
          <option value="video-lookup">Video lookup by ID</option>
          <option value="profile-videos">Profile videos (first 10)</option>
        </select>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={operation === "video-lookup" ? "Video ID (e.g. x5auisp)" : "Profile ID (e.g. lequipe)"}
          className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold"
        />
        <button type="button" disabled={loading || !input.trim()} onClick={() => void run()} className="min-h-11 rounded-md bg-[var(--primary)] px-5 text-sm font-black text-white disabled:opacity-60">
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>

      {response && !response.ok && <p className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-sm" role="alert">{response.error}</p>}

      {response?.ok && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Column title="Legacy API v1" side={response.v1} />
            <Column title="API v2" side={response.v2} />
          </div>
          {response.fieldNotes && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="font-black">Field & behavior differences</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--muted-foreground)]">
                {response.fieldNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
