import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function ChannelsV2Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Channel Search v2…</p>}>
      <DiscoveryExplorer
        version="v2"
        resource="channels"
        pageTitle="Channel Search v2"
        pageDescription="Profile lookup on API v2 (authenticated, profile.read). v2 has no global profile search — look up by profile_id or bootstrap ids via /me."
        counterpartPath="/channels-v1"
      />
    </Suspense>
  );
}
