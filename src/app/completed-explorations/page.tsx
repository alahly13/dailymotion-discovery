// Completed Explorations Page (2026)
//
// What this controls: Server route at `/completed-explorations` rendering the
// CompletedExplorationsWorkspace client component wrapped in a Suspense boundary.
// Scope: Library navigation.

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CompletedExplorationsWorkspace } from "@/components/completed-explorations/completed-explorations-workspace";

export const metadata = {
  title: "Completed Explorations — Dailymotion Discovery",
  description: "Permanent local archive of completed channel and playlist explorations with zero-network-call IndexedDB storage.",
};

export default function CompletedExplorationsPage() {
  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <CompletedExplorationsWorkspace />
      </Suspense>
    </main>
  );
}
