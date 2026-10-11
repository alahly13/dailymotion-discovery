import { Suspense } from "react";
import { UnifiedSearch } from "@/components/discovery/unified-search";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm">Loading search…</p>}>
      <UnifiedSearch />
    </Suspense>
  );
}
