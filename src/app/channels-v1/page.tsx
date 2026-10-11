import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function ChannelsV1Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Channel Search v1…</p>}>
      <DiscoveryExplorer
        version="v1"
        resource="channels"
        pageTitle="Channel Search v1"
        pageDescription="Global channel discovery on Legacy API v1 (channels are user profiles). Search globally, look up a profile, or list videos owned by a profile."
        counterpartPath="/channels-v2"
      />
    </Suspense>
  );
}
