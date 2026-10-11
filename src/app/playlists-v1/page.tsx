import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function PlaylistsV1Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Playlist Search v1…</p>}>
      <DiscoveryExplorer
        version="v1"
        resource="playlists"
        pageTitle="Playlist Search v1"
        pageDescription="Playlist discovery on Legacy API v1. Anonymous global playlist search is blocked upstream (403) — list playlists by owner, open by ID, or browse playlist contents."
        counterpartPath="/playlists-v2"
      />
    </Suspense>
  );
}
