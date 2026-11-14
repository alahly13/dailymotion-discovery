import { Suspense } from "react";
import { LinkExplorerWorkspace } from "@/components/link-explorer/link-explorer-workspace";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Link Explorer — Dailymotion Discovery",
  description: "Universal URL & resource identifier analyzer for Dailymotion Legacy v1 and Modern REST v2 APIs.",
};

export default function LinkExplorerPage() {
  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <LinkExplorerWorkspace />
      </Suspense>
    </main>
  );
}
