import type { DiscoveryItem } from "@/lib/discovery/types";
import type {
  LocalSearchSnapshotRecord,
  LocalSearchSnapshotPageRecord,
} from "@/lib/local-first/indexeddb-store";

export type { LocalSearchSnapshotRecord, LocalSearchSnapshotPageRecord };

export interface CaptureSearchSnapshotParams {
  query: string;
  route: string;
  apiVersion: "v1" | "v2";
  resourceType: string;
  mode?: string;
  apiParams?: Record<string, unknown>;
  localFilters?: Record<string, unknown>;
  rawResponse: unknown; // Full untouched Dailymotion API payload
  items: DiscoveryItem[];
  pageIndex?: number;
  totalResults?: number;
}

export interface ReplaySearchSnapshotResult {
  snapshot: LocalSearchSnapshotRecord;
  pages: LocalSearchSnapshotPageRecord[];
  items: DiscoveryItem[];
  isExpired: boolean;
}
