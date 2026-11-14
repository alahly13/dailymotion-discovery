"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookmarkCheck,
  Compass,
  ExternalLink,
  History,
  LayoutDashboard,
  Library,
  Link as LinkIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ApiStatusBar } from "@/components/discovery/api-status-bar";
import { ThemeToggle } from "./theme-toggle";

// Consolidated Navigation Architecture (2026):
// Replaces cluttered per-resource discovery silos with ONLY TWO primary discovery experiences:
// 1. Global Search (/global-search): full-text cross-resource search with API v1/v2 switching.
// 2. Link Explorer (/link-explorer): universal URL & resource identifier analyzer with v1/v2 switching.
// Library: Saved Items, Search History, and Collections.
// System: Settings, Account, and Admin.

interface NavSubLink {
  label: string;
  href: string;
  version: "v1" | "v2";
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  sublinks?: NavSubLink[];
}

interface NavSection {
  label: string;
  links: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Overview",
    links: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Discovery",
    links: [
      {
        label: "Global Search",
        href: "/global-search",
        icon: Search,
        sublinks: [
          { label: "V1 — Legacy", href: "/global-search?v=v1", version: "v1" },
          { label: "V2 — Current", href: "/global-search?v=v2", version: "v2" },
        ],
      },
      {
        label: "Link Explorer",
        href: "/link-explorer",
        icon: LinkIcon,
        sublinks: [
          { label: "V1 — Legacy", href: "/link-explorer?v=v1", version: "v1" },
          { label: "V2 — Current", href: "/link-explorer?v=v2", version: "v2" },
        ],
      },
    ],
  },
  {
    label: "Library",
    links: [
      { label: "Saved Items", href: "/saved-items", icon: BookmarkCheck },
      { label: "Search History", href: "/search-history", icon: History },
      { label: "Collections", href: "/collections", icon: Library },
    ],
  },
  {
    label: "System",
    links: [
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Account", href: "/account", icon: UserRound },
      { label: "Admin", href: "/admin", icon: Shield },
    ],
  },
];

function BrandMark({ size }: { size: "md" | "sm" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/dailymotion-icon.svg"
      alt="Dailymotion Discovery"
      className={size === "md" ? "h-8 w-8 rounded-md shrink-0" : "h-7 w-7 rounded-md shrink-0"}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore sidebar preference from localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem("dm_sidebar_open");
      if (saved !== null) {
        setIsSidebarOpen(saved === "true");
      }
    } catch {
      // Fallback
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("dm_sidebar_open", String(next));
      } catch {
        // Non-fatal
      }
      return next;
    });
  };

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, searchParams]);

  const isOpen = mounted ? isSidebarOpen : true;

  // Active state checkers
  const currentVersionParam = searchParams.get("v") || "v1";

  const isParentActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isSublinkActive = (sub: NavSubLink) => {
    const [targetPath, queryPart] = sub.href.split("?");
    if (pathname !== targetPath) return false;
    const targetV = new URLSearchParams(queryPart).get("v");
    return targetV === currentVersionParam;
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden">
      {/* ── Desktop Persistent Sidebar (Expanded: w-64 | Collapsed: w-16) ──── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-[var(--border)] bg-[var(--surface-container-low)]/98 transition-all duration-300 ease-in-out lg:flex lg:flex-col",
          isOpen ? "w-64 p-4" : "w-16 p-2.5 items-center"
        )}
      >
        {/* Brand & Toggle Header */}
        <div
          className={cn(
            "mb-4 flex items-center border-b border-[var(--border)] pb-3 w-full",
            isOpen ? "justify-between gap-3" : "justify-center"
          )}
        >
          {isOpen ? (
            <>
              <Link href="/" className="group flex items-center gap-2.5 min-w-0">
                <BrandMark size="md" />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-black tracking-tight text-[var(--foreground)]">
                    Dailymotion
                  </span>
                  <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Discovery Terminal
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={toggleSidebar}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] cursor-pointer"
                title="Collapse sidebar (Compact rail)"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:bg-[var(--surface-container-high)] cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto w-full",
            isOpen ? "space-y-4 pr-1" : "space-y-3 flex flex-col items-center"
          )}
          aria-label="Primary Navigation"
        >
          {navSections.map((section) => (
            <div key={section.label} className={isOpen ? "w-full" : "flex flex-col items-center"}>
              {isOpen && (
                <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  {section.label}
                </p>
              )}
              <div className={cn("space-y-1", isOpen ? "w-full" : "flex flex-col items-center")}>
                {section.links.map((link) => {
                  const active = isParentActive(link.href);
                  const Icon = link.icon;

                  if (!isOpen) {
                    // Compact mode: icon rail with tooltips
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        title={link.label}
                        aria-label={link.label}
                        className={cn(
                          "relative flex h-9 w-9 items-center justify-center rounded-lg border transition",
                          active
                            ? "border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"
                            : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {link.sublinks && (
                          <span className="absolute -bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                        )}
                      </Link>
                    );
                  }

                  // Expanded mode: full view with nested version links
                  return (
                    <div key={link.href} className="space-y-0.5">
                      <Link
                        href={link.href}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                          active
                            ? "border-[color-mix(in_srgb,var(--primary)_34%,transparent)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--foreground)]"
                            : "text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            active
                              ? "text-[var(--primary)]"
                              : "text-[var(--muted-foreground)] group-hover:text-[var(--primary)]"
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{link.label}</span>
                      </Link>

                      {/* Nested Version Sub-Links (V1 — Legacy / V2 — Current) */}
                      {link.sublinks && active && (
                        <div className="ml-4 pl-2.5 border-l border-[var(--border)] space-y-0.5 pt-0.5">
                          {link.sublinks.map((sub) => {
                            const subActive = isSublinkActive(sub);
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                  "flex items-center gap-2 rounded px-2 py-1 text-[11px] font-semibold transition",
                                  subActive
                                    ? "bg-[var(--primary)] text-white shadow-2xs font-bold"
                                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)]"
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    subActive ? "bg-white" : "bg-[var(--muted-foreground)]"
                                  )}
                                />
                                <span>{sub.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Reference Companion Link */}
          {isOpen && (
            <div className="pt-2 w-full">
              <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Reference Companion
              </p>
              <a
                href="https://youtube-discovery.vercel.app/"
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
                <span className="truncate">YouTube Discovery</span>
                <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 opacity-60" />
              </a>
            </div>
          )}
        </nav>

        {/* Footer info (only in expanded mode) */}
        {isOpen && (
          <div className="mt-auto border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted-foreground)] w-full">
            <p className="font-semibold text-[var(--foreground)]">Metadata Research Only</p>
            <p className="text-[10px] leading-4 text-[var(--muted-foreground)]">
              Dailymotion V1/V2 APIs. No binary downloads.
            </p>
          </div>
        )}
      </aside>

      {/* ── Mobile Drawer Navigation ─────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex w-4/5 max-w-xs flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl z-10">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
              <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
                <BrandMark size="sm" />
                <div>
                  <span className="block text-sm font-black text-[var(--foreground)]">Dailymotion</span>
                  <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
                    Discovery
                  </span>
                </div>
              </Link>
              <button
                type="button"
                className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] cursor-pointer"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto">
              {navSections.map((section) => (
                <div key={section.label}>
                  <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.links.map((link) => {
                      const active = isParentActive(link.href);
                      const Icon = link.icon;
                      return (
                        <div key={link.href} className="space-y-0.5">
                          <Link
                            href={link.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition",
                              active
                                ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)]"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span>{link.label}</span>
                          </Link>

                          {link.sublinks && active && (
                            <div className="ml-4 pl-2.5 border-l border-[var(--border)] space-y-0.5 pt-0.5">
                              {link.sublinks.map((sub) => {
                                const subActive = isSublinkActive(sub);
                                return (
                                  <Link
                                    key={sub.href}
                                    href={sub.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={cn(
                                      "flex items-center gap-2 rounded px-2 py-1 text-[11px] font-semibold transition",
                                      subActive
                                        ? "bg-[var(--primary)] text-white shadow-2xs font-bold"
                                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)]"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        subActive ? "bg-white" : "bg-[var(--muted-foreground)]"
                                      )}
                                    />
                                    <span>{sub.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content Area with Adaptive Left Padding ──────────────────── */}
      <div
        className={cn(
          "transition-[padding] duration-300 ease-in-out min-h-screen flex flex-col",
          isOpen ? "lg:pl-64" : "lg:pl-16"
        )}
      >
        {/* Sticky Global Top Header Bar */}
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-2.5 backdrop-blur-md md:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
            {/* Left Controls */}
            <div className="flex items-center gap-2.5">
              {/* Mobile drawer toggle */}
              <button
                type="button"
                className="inline-flex lg:hidden h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] cursor-pointer"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label="Toggle navigation drawer"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                <span>Menu</span>
              </button>

              {/* Desktop Show / Hide Navbar toggle */}
              <button
                type="button"
                onClick={toggleSidebar}
                className={cn(
                  "hidden lg:inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition cursor-pointer",
                  isOpen
                    ? "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
                    : "border-[var(--primary)]/60 bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_22%,transparent)]"
                )}
                aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
                title={isOpen ? "Collapse sidebar (Compact rail)" : "Expand sidebar (Full view)"}
              >
                {isOpen ? (
                  <>
                    <PanelLeftClose className="h-3.5 w-3.5" />
                    <span>Collapse</span>
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
                    <span className="font-bold">Expand</span>
                  </>
                )}
              </button>

              {/* Architecture Badges */}
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400">
                  Dual-API Terminal
                </span>
                <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-extrabold text-sky-400">
                  Quota-Aware
                </span>
                <span className="hidden xl:inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-extrabold text-purple-400">
                  Manifest-First
                </span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/global-search"
                className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Global Search</span>
              </Link>
              <Link
                href="/link-explorer"
                className="hidden lg:inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span>Link Explorer</span>
              </Link>
              <Link
                href="/search-history"
                className="hidden md:inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                <History className="h-3.5 w-3.5" />
                <span>History</span>
              </Link>
              <Link
                href="/saved-items"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                <BookmarkCheck className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="hidden sm:inline">Saved Items</span>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Global Page Container */}
        <main className="mx-auto min-w-0 max-w-[1600px] flex-1 w-full px-4 py-5 sm:py-6 lg:px-6">
          <ApiStatusBar />
          {children}
        </main>
      </div>
    </div>
  );
}
