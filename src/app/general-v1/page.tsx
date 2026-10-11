import { Suspense } from "react";
import { DiscoveryExplorer } from "@/components/discovery/discovery-explorer";

export default function GeneralV1Page() {
  return (
    <Suspense fallback={<p className="text-sm">Loading General Search v1…</p>}>
      <DiscoveryExplorer
        version="v1"
        resource="general"
        pageTitle="General Search v1"
        pageDescription="Global full-text discovery across public Dailymotion videos via Legacy API GET /videos. Query is preserved exactly; filters use documented v1 parameter names."
        counterpartPath="/general-v2"
      />
    </Suspense>
  );
}
