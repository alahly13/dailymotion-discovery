// /capabilities — v1 vs v2 comparison page, driven by the capability registry.
//
// What this controls: the source-of-truth matrix deciding which controls are
// enabled in each workspace. Rendered from `listCapabilities()` so docs and
// UI can never drift apart.

import Link from "next/link";
import { listCapabilities } from "@/lib/discovery/capability-registry";
import type { DiscoveryResource } from "@/lib/discovery/types";

const RESOURCE_ORDER: DiscoveryResource[] = ["general", "videos", "channels", "playlists", "users", "live"];

const PAGE_LINKS: Record<string, string> = {
  "general:v1": "/general-v1", "general:v2": "/general-v2",
  "videos:v1": "/videos-v1", "videos:v2": "/videos-v2",
  "channels:v1": "/channels-v1", "channels:v2": "/channels-v2",
  "playlists:v1": "/playlists-v1", "playlists:v2": "/playlists-v2",
  "users:v1": "/users-v1", "users:v2": "/users-v2",
  "live:v1": "/live-v1", "live:v2": "/live-v2",
};

export default function CapabilitiesPage() {
  const capabilities = listCapabilities();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Source of truth</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">API Capabilities: v1 vs v2</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Every resource and operation, per version: availability, authentication, filters, pagination, limits, and evidence.
          Evidence legend — <strong>live</strong>: verified by a real API call on 2026-10-10 · <strong>mock</strong>: fixtures/tests only (v2 needs credentials) · <strong>documented</strong>: official reference.
        </p>
      </div>

      {RESOURCE_ORDER.map((resource) => {
        const pair = capabilities.filter((c) => c.resource === resource);
        return (
          <section key={resource} className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted-foreground)]">
                  <th className="p-4">Aspect</th>
                  {pair.map((c) => (
                    <th key={c.version} className="p-4">
                      <Link href={PAGE_LINKS[`${resource}:${c.version}`]} className="text-[var(--primary)] hover:underline">
                        {c.title} →
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr]:border-[var(--border)] [&_tr:last-child]:border-0">
                <tr><td className="p-4 font-bold">Endpoint</td>{pair.map((c) => <td key={c.version} className="p-4"><code className="text-xs">{c.endpoint}</code></td>)}</tr>
                <tr><td className="p-4 font-bold">Global search</td>{pair.map((c) => <td key={c.version} className="p-4">{c.globalSearch ? "Yes" : "No — alternative workflow"}</td>)}</tr>
                <tr><td className="p-4 font-bold">Authentication</td>{pair.map((c) => <td key={c.version} className="p-4">{c.auth === "public" ? "Public (no key)" : c.auth === "required" ? `Required (${c.requiredScope})` : "Optional token"}</td>)}</tr>
                <tr><td className="p-4 font-bold">Server filters</td>{pair.map((c) => <td key={c.version} className="p-4 text-xs">{c.serverFilters.length > 0 ? c.serverFilters.map((f) => f.key).join(", ") : "—"}</td>)}</tr>
                <tr><td className="p-4 font-bold">Sorts</td>{pair.map((c) => <td key={c.version} className="p-4 text-xs">{c.sorts.length > 0 ? c.sorts.map((s) => s.value).join(", ") : "—"}</td>)}</tr>
                <tr><td className="p-4 font-bold">Pagination</td>{pair.map((c) => <td key={c.version} className="p-4 text-xs">{c.pagination === "v1-page-limit" ? "page / limit + has_more" : "page / page_size + opaque next"}</td>)}</tr>
                <tr><td className="p-4 font-bold">Result window</td>{pair.map((c) => <td key={c.version} className="p-4 text-xs">{c.resultWindowCap}</td>)}</tr>
                <tr><td className="p-4 font-bold">Evidence</td>{pair.map((c) => <td key={c.version} className="p-4"><span className="rounded bg-[var(--surface-container-high)] px-2 py-0.5 text-xs font-black uppercase">{c.evidence}</span></td>)}</tr>
                <tr><td className="p-4 font-bold">Notes</td>{pair.map((c) => <td key={c.version} className="p-4 text-xs leading-5 text-[var(--muted-foreground)]">{c.notes} <a href={c.docUrl} target="_blank" rel="noreferrer noopener" className="text-[var(--primary)] hover:underline">Docs</a></td>)}</tr>
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
