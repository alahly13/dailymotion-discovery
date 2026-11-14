"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowUpRight,
  BookmarkCheck,
  Bot,
  Compass,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  History,
  LayoutDashboard,
  Library,
  Link as LinkIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Settings,
  Shield,
  Tv,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ApiStatusBar } from "@/components/discovery/api-status-bar";
import { ThemeToggle } from "./theme-toggle";

// Consolidated Navigation Architecture (2026):
// Replaces cluttered per-resource discovery silos with ONLY TWO primary discovery experiences:
// 1. Global Search (/global-search): full-text cross-resource search with API v1/v2 switching.
// 2. Link Explorer (/link-explorer): universal URL & resource identifier analyzer.
// Library: Saved Items, Search History, and Collections.
// System: Settings, Admin, and Storage diagnostics.
const groups: { label: string; links: { label: string; href: string; icon: typeof Search }[] }[] = [
  {
    label: "Overview",
    links: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Discovery",
    links: [
      { label: "Global Search", href: "/global-search", icon: Search },
      { label: "Link Explorer", href: "/link-explorer", icon: LinkIcon },
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
      { label: "Admin", href: "/admin", icon: Shield },
      { label: "Storage & R2", href: "/storage", icon: Database },
      { label: "Capabilities", href: "/capabilities", icon: FileText },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark({ size }: { size: "md" | "sm" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/dailymotion-icon.svg"
      alt="Dailymotion Discovery"
      className={size === "md" ? "h-9 w-9 rounded-md" : "h-7 w-7 rounded-md"}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore sidebar collapse state from localStorage on client mount
  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem("dm_sidebar_open");
      if (saved !== null) {
        setIsSidebarOpen(saved === "true");
      }
    } catch {
      // Fallback to default open
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
  }, [pathname]);

  const isOpen = mounted ? isSidebarOpen : true;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden">
      {/* Desktop Persistent Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[var(--surface-container-low)]/98 p-4 lg:flex lg:flex-col transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
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
            title="Hide Navbar (Collapse sidebar)"
            aria-label="Hide Navbar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto pr-1" aria-label="Primary Desktop Navigation">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.links.map(({ label, href, icon: Icon }) => {
                  const active = isActivePath(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
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
                          active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)] group-hover:text-[var(--primary)]"
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Reference Companion Project */}
          <div className="pt-2">
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
        </nav>

        <div className="mt-auto border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted-foreground)]">
          <p className="font-semibold text-[var(--foreground)]">Metadata Research Only</p>
          <p className="text-[10px] leading-4 text-[var(--muted-foreground)]">
            Dailymotion V1/V2 APIs. No binary downloads.
          </p>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
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
                className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)]"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.links.map(({ label, href, icon: Icon }) => {
                      const active = isActivePath(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition",
                            active
                              ? "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]"
                              : "text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)]"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area with Adaptive Left Padding */}
      <div
        className={cn(
          "transition-[padding] duration-300 ease-in-out min-h-screen flex flex-col",
          isOpen ? "lg:pl-64" : "lg:pl-0"
        )}
      >
        {/* Sticky Global Top Header Bar */}
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-2.5 backdrop-blur-md md:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
            {/* Left Controls: Sidebar & Drawer Toggles */}
            <div className="flex items-center gap-2.5">
              {/* Mobile menu toggle */}
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
                aria-label={isOpen ? "Hide Navbar" : "Show Navbar"}
                title={isOpen ? "Hide Navbar (Collapse sidebar)" : "Show Navbar (Expand sidebar)"}
              >
                {isOpen ? (
                  <>
                    <PanelLeftClose className="h-3.5 w-3.5" />
                    <span>Hide Navbar</span>
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
                    <span className="font-bold">Show Navbar</span>
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

            {/* Right Controls: Quick Navigation & Theme */}
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/global-search"
                className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
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
