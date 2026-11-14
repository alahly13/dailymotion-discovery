"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    const isDark = root.classList.contains("dark") || root.dataset.theme === "dark";
    setTheme(isDark ? "dark" : "light");

    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme" && (e.newValue === "light" || e.newValue === "dark")) {
        setTheme(e.newValue);
        root.classList.toggle("dark", e.newValue === "dark");
        root.dataset.theme = e.newValue;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const current = root.classList.contains("dark") ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";

    root.classList.toggle("dark", next === "dark");
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // safe fallback in private mode / strict storage
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle color theme"}
      title={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle color theme"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] cursor-pointer select-none"
    >
      {mounted ? (
        theme === "dark" ? (
          <Sun className="h-4 w-4 text-amber-400 hover:text-amber-300 transition-transform duration-200" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4 text-sky-600 hover:text-sky-700 transition-transform duration-200" aria-hidden="true" />
        )
      ) : (
        <>
          <Sun className="h-4 w-4 dark:hidden text-amber-500" aria-hidden="true" />
          <Moon className="hidden h-4 w-4 dark:block text-sky-400" aria-hidden="true" />
        </>
      )}
    </button>
  );
}
