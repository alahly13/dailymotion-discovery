import { Suspense } from "react";
import { UnifiedSearch } from "@/components/discovery/unified-search";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Global Search — Dailymotion Discovery",
  description: "Unified cross-resource discovery workspace with API v1/v2 switching and local filters.",
};

export default function GlobalSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <UnifiedSearch />
    </Suspense>
  );
}
