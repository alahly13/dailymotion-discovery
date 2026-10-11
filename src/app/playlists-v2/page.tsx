import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function PlaylistsV2Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading Playlist Search v2…</p>}>
      <DiscoveryExplorer
        version="v2"
        resource="playlists"
        pageTitle="Playlist Search v2"
        pageDescription="Playlist discovery on API v2 (authenticated, playlist.read). No global playlist search exists in v2 — list by profile, open by ID, or browse playlist contents in order."
        counterpartPath="/playlists-v1"
      />
    </Suspense>
  );
}
