import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function UsersV2Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading User Search v2…</p>}>
      <DiscoveryExplorer
        version="v2"
        resource="users"
        pageTitle="User Search v2"
        pageDescription="User lookup on API v2 (authenticated, account.read). v2 has no user search endpoint — look up by user_id or inspect your identity via /me."
        counterpartPath="/users-v1"
      />
    </Suspense>
  );
}
