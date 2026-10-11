import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function VideosV2Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Video Search v2…</p>}>
      <DiscoveryExplorer
        version="v2"
        resource="videos"
        pageTitle="Video Search v2"
        pageDescription="Profile video browsing plus direct lookup by video_id on API v2 (authenticated, video.read). Field selection uses v2 sparse fields with dot notation."
        counterpartPath="/videos-v1"
      />
    </Suspense>
  );
}
