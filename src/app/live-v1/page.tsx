import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function LiveV1Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Live Content v1…</p>}>
      <DiscoveryExplorer
        version="v1"
        resource="live"
        pageTitle="Live Content v1"
        pageDescription="Live discovery on Legacy API v1 via video mode and live status flags (on-air, upcoming, off-air) — public, sortable by live audience."
        counterpartPath="/live-v2"
      />
    </Suspense>
  );
}
