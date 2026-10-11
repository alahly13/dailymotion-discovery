// /docs — API documentation & capability gateway (routes to inventories).

import Link from "next/link";

const SECTIONS = [
  { title: "Capabilities matrix (v1 vs v2)", href: "/capabilities", description: "Per-resource availability, auth, filters, pagination, limits, evidence, and doc links — the source of truth for workspace controls." },
  { title: "v1 capability inventory", href: "https://developers.dailymotion.com/v0/reference", external: true, description: "Official Legacy API reference (project inventory: docs/api-v1-capability-inventory.md)." },
  { title: "v2 capability inventory", href: "https://developers.dailymotion.com/reference", external: true, description: "Official API v2 reference (project inventory: docs/api-v2-capability-inventory.md)." },
  { title: "Migrating from Legacy API to API v2", href: "https://developers.dailymotion.com/docs/migrating-from-legacy-api-to-api-v2.md", external: true, description: "Official per-endpoint migration guide with field maps." },
  { title: "v2 authentication guide", href: "https://developers.dailymotion.com/docs/authenticate.md", external: true, description: "Private API keys + client_credentials (30-minute tokens)." },
  { title: "Legacy authentication guide", href: "https://developers.dailymotion.com/v0/docs/authenticate.md", external: true, description: "Public/private keys, grants, endpoint compatibility matrix." },
  { title: "Browse large catalogs (v2)", href: "https://developers.dailymotion.com/docs/browse-large-video-catalog.md", external: true, description: "1000-result window + date-window splitting strategy." },
  { title: "Browse large catalogs (legacy)", href: "https://developers.dailymotion.com/v0/docs/browse-large-video-catalog.md", external: true, description: "Same strategy with unix timestamps and limit/page." },
];

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Workspace</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">API Documentation & Capabilities</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Start with the in-app capabilities matrix, then follow the official references. Environment setup lives in <Link href="/settings" className="text-[var(--primary)] hover:underline">Settings</Link>.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-black">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{section.description}</p>
            {section.external ? (
              <a href={section.href} target="_blank" rel="noreferrer noopener" className="mt-3 inline-block text-sm font-black text-[var(--primary)] hover:underline">
                Open official docs ↗
              </a>
            ) : (
              <Link href={section.href} className="mt-3 inline-block text-sm font-black text-[var(--primary)] hover:underline">
                Open →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
