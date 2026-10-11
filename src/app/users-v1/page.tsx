import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function UsersV1Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading User Search v1…</p>}>
      <DiscoveryExplorer
        version="v1"
        resource="users"
        pageTitle="User Search v1"
        pageDescription="Global user discovery on Legacy API v1 — public search with country, language, username, and popularity filters, plus direct lookup."
        counterpartPath="/users-v2"
      />
    </Suspense>
  );
}
