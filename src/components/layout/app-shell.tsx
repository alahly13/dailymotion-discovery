"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Archive,
  ArrowUpRight,
  Bot,
  Compass,
  Database,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Library,
  Radio,
  Search,
  Settings,
  Tv,
  UserRound,
  UsersRound,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ApiStatusBar } from "@/components/discovery/api-status-bar";
import { ThemeToggle } from "./theme-toggle";

// Sidebar navigation groups. Dashboard first, then the paired v1/v2 discovery
// workspaces (the two versions stay adjacent), then compare/capabilities,
// workspace, and the pre-existing library pages (preserved, not removed).
// Future agents: add new discovery pages inside their version pair; keep
// Dashboard first and the external YouTube link last.
const groups: { label: string; links: { label: string; href: string; icon: typeof Search }[] }[] = [
  { label: "Overview", links: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }] },
  {
    label: "General Search",
    links: [
      { label: "General v1", href: "/general-v1", icon: Search },
      { label: "General v2", href: "/general-v2", icon: Search },
    ],
  },
  {
    label: "Videos",
    links: [
      { label: "Videos v1", href: "/videos-v1", icon: Tv },
      { label: "Videos v2", href: "/videos-v2", icon: Tv },
    ],
  },
  {
    label: "Channels",
    links: [
      { label: "Channels v1", href: "/channels-v1", icon: Compass },
      { label: "Channels v2", href: "/channels-v2", icon: Compass },
    ],
  },
  {
    label: "Playlists",
    links: [
      { label: "Playlists v1", href: "/playlists-v1", icon: Library },
      { label: "Playlists v2", href: "/playlists-v2", icon: Library },
    ],
  },
  {
    label: "Users",
    links: [
      { label: "Users v1", href: "/users-v1", icon: UsersRound },
      { label: "Users v2", href: "/users-v2", icon: UserRound },
    ],
  },
  {
    label: "Live",
    links: [
      { label: "Live v1", href: "/live-v1", icon: Radio },
      { label: "Live v2", href: "/live-v2", icon: Radio },
    ],
  },
  {
    label: "Compare",
    links: [
      { label: "Compare v1/v2", href: "/compare", icon: FlaskConical },
      { label: "Capabilities", href: "/capabilities", icon: FileText },
    ],
  },
  {
    label: "Workspace",
    links: [
      { label: "History & Saved", href: "/workspace", icon: Archive },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "API Docs", href: "/docs", icon: FileText },
    ],
  },
  {
    label: "Library",
    links: [
      { label: "Channel Explorer", href: "/channel-explorer", icon: Compass },
      { label: "Channels", href: "/channels", icon: Database },
      { label: "Search", href: "/search", icon: Search },
      { label: "AI Search", href: "/ai-search", icon: Bot },
      { label: "Saved / Library", href: "/saved", icon: Archive },
    ],
  },
];

const flatLinks = groups.flatMap((group) => group.links);

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark({ size }: { size: "md" | "sm" }) {
  return (
    // Dailymotion brand asset (public/dailymotion-icon.svg) as the app logo.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/dailymotion-icon.svg"
      alt="Dailymotion Discovery"
      className={size === "md" ? "h-10 w-10 rounded-md" : "h-9 w-9 rounded-md"}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-[var(--foreground)] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Desktop navigation owns the persistent research-terminal frame. Keep it
          outside page content so route screens can stay focused on real data. */}
      <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-container-low)]/96 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-[var(--border)] px-5 py-5">
          <Link href="/" className="group flex items-center gap-3">
            <BrandMark size="md" />
            <span className="min-w-0">
              <span className="block truncate text-base font-black tracking-tight text-[var(--foreground)]">
                Dailymotion Discovery
              </span>
              <span className="block truncate text-xs font-bold uppercase text-[var(--muted-foreground)]">
                Dual-API Terminal
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Primary">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.links.map(({ label, href, icon: Icon }) => {
                  const active = isActivePath(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
                        active
                          ? "border-[color-mix(in_srgb,var(--primary)_34%,transparent)] bg-[color-mix(in_srgb,var(--primary)_13%,transparent)] text-[var(--foreground)]"
                          : "text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)] group-hover:text-[var(--primary)]")} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Companion reference project (external, safe new-tab link). */}
          <div>
            <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Reference
            </p>
            <a
              href="https://youtube-discovery.vercel.app/"
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
            >
              <ExternalLink className="h-4 w-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" aria-hidden="true" />
              <span>YouTube Discovery</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-4">
          <div className="panel-muted p-3 text-xs leading-5 text-[var(--muted-foreground)]">
            <p className="font-black uppercase text-[var(--foreground)]">Metadata only</p>
            <p className="mt-1">Public v1 discovery plus authenticated v2 workspaces. No downloading or rehosting.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile/tablet top navigation collapses the sidebar into scrollable
            chips and keeps the command actions reachable without horizontal overflow. */}
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/88 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-3 lg:px-7">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex min-w-0 items-center gap-3 lg:hidden">
                <BrandMark size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">Dailymotion Discovery</span>
                  <span className="block truncate text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Dual-API Terminal</span>
                </span>
              </Link>

              <div className="hidden min-w-0 items-center gap-3 lg:flex">
                <div className="terminal-rule h-6 w-16 rounded-full" aria-hidden="true" />
                <p className="truncate text-sm font-bold text-[var(--muted-foreground)]">Legacy v1 + API v2 discovery workspaces</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/general-v1"
                  className="hidden min-h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)] sm:inline-flex"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Search Workspace
                </Link>
                <ThemeToggle />
              </div>
            </div>

            <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="Primary">
              {flatLinks.map(({ label, href, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-black transition",
                      active
                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)]"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
              <a
                href="https://youtube-discovery.vercel.app/"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-black text-[var(--muted-foreground)]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                YouTube Discovery
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-[1500px] px-4 py-6 sm:py-8 lg:px-7">
          {/* Global API status + usage bar on every page. Compact, non-blocking,
              sanitized data only; failures never prevent navigation. */}
          <ApiStatusBar />
          {children}
        </main>
      </div>
    </div>
  );
}
