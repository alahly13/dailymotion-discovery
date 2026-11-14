import type { DiscoveryItem } from "@/lib/discovery/types";
import type { DailymotionSourceMetadata } from "@/lib/discovery/provenance";
import type {
  LocalSearchSnapshotRecord,
  LocalSearchSnapshotPageRecord,
} from "@/lib/local-first/indexeddb-store";

export type { LocalSearchSnapshotRecord, LocalSearchSnapshotPageRecord };

export interface CaptureSearchSnapshotParams {
  query: string;
  route: string;
  workspace?: "global_search" | "link_explorer" | string;
  ownerId?: string;
  apiVersion: "v1" | "v2";
  resourceType: string;
  mode?: string;
  apiParams?: Record<string, unknown>;
  localFilters?: Record<string, unknown>;
  rawResponse: unknown; // Full untouched Dailymotion API payload (ZERO media binaries)
  items: DiscoveryItem[];
  pageIndex?: number;
  totalResults?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  provenance?: DailymotionSourceMetadata;
}

export interface ReplaySearchSnapshotResult {
  snapshot: LocalSearchSnapshotRecord;
  pages: LocalSearchSnapshotPageRecord[];
  items: DiscoveryItem[];
  isExpired: boolean;
}
