import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function VideosV1Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Video Search v1…</p>}>
      <DiscoveryExplorer
        version="v1"
        resource="videos"
        pageTitle="Video Search v1"
        pageDescription="Global video search, direct lookup by xID, and related-video browsing on Legacy API v1 — all public, all paginated with has_more semantics."
        counterpartPath="/videos-v2"
      />
    </Suspense>
  );
}
