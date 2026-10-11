import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dailymotion Discovery — Dual-API Platform",
  description: "Version-separated public Dailymotion discovery across Legacy API v1 and API v2.",
  icons: { icon: "/dailymotion-icon.svg", shortcut: "/dailymotion-icon.svg", apple: "/dailymotion-icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${publicSans.variable} ${jetBrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme bootstrapping belongs to the root shell so every page paints in
            the persisted light/dark mode before AppShell hydrates. Future UI
            work should preserve this tiny fail-soft script to avoid flashes. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(() => { try { const stored = localStorage.getItem('theme'); const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; const next = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', next === 'dark'); document.documentElement.dataset.theme = next; } catch {} })();",
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
