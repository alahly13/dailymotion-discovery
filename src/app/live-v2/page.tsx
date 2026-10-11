import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function LiveV2Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Live Content v2…</p>}>
      <DiscoveryExplorer
        version="v2"
        resource="live"
        pageTitle="Live Content v2"
        pageDescription="Livestream discovery on API v2 (authenticated, live.read). List a profile's livestreams with status filters, or look up a livestream directly."
        counterpartPath="/live-v1"
      />
    </Suspense>
  );
}
