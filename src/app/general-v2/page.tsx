import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function GeneralV2Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading General Search v2…</p>}>
      <DiscoveryExplorer
        version="v2"
        resource="general"
        pageTitle="General Search v2"
        pageDescription="Profile-scoped video discovery via API v2. v2 exposes no global search endpoint, so this page browses a known profile's catalog with v2 filters — an explicit alternative, never a fake global search."
        counterpartPath="/general-v1"
      />
    </Suspense>
  );
}
