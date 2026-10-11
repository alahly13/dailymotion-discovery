import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown } from "../countdown";
import { useDiscoveryWorkspace, utcDayKey } from "../../../stores/discovery-workspace-store";

function testStorage(): Map<string, string> {
  return (globalThis as unknown as { __testLocalStorage: Map<string, string> }).__testLocalStorage;
}

function testItem(version: "v1" | "v2", id: string, title: string) {
  return {
    kind: "video" as const,
    apiVersion: version,
    id,
    title,
    description: null,
    thumbnail: null,
    url: null,
    duration: null,
    language: null,
    country: null,
    category: null,
    createdAt: null,
    year: null,
    tags: [],
    ownerId: null,
    ownerName: null,
    views: null,
    extra: {},
    raw: {},
  };
}

beforeEach(() => {
  testStorage().clear();
  useDiscoveryWorkspace.setState({
    history: [],
    savedSearches: [],
    savedItems: [],
    usage: {
      v1: { today: utcDayKey(), todaySearches: 0, todaySuccess: 0, todayFailed: 0, todayApiCalls: 0, totalSearches: 0, totalSuccess: 0, totalFailed: 0, totalApiCalls: 0, lastSuccessAt: null, lastRequestAt: null },
      v2: { today: utcDayKey(), todaySearches: 0, todaySuccess: 0, todayFailed: 0, todayApiCalls: 0, totalSearches: 0, totalSuccess: 0, totalFailed: 0, totalApiCalls: 0, lastSuccessAt: null, lastRequestAt: null },
    },
  });
});

describe("usage metrics (application-tracked, UTC days)", () => {
  it("counts one submit once; appends add API calls only", () => {
    const store = useDiscoveryWorkspace.getState();
    store.recordSearchSubmitted("v1");
    store.recordSearchOutcome("v1", true, 1);
    store.recordApiCalls("v1", 2); // pagination appends
    const usage = useDiscoveryWorkspace.getState().usage.v1;
    expect(usage.todaySearches).toBe(1);
    expect(usage.totalSearches).toBe(1);
    expect(usage.todaySuccess).toBe(1);
    expect(usage.todayFailed).toBe(0);
    expect(usage.todayApiCalls).toBe(3);
    expect(usage.lastSuccessAt).not.toBeNull();
  });

  it("keeps v1 and v2 counters independent and rolls the UTC day", () => {
    const store = useDiscoveryWorkspace.getState();
    store.recordSearchSubmitted("v1");
    store.recordSearchOutcome("v1", false, 1);
    store.recordSearchSubmitted("v2");
    store.recordSearchOutcome("v2", true, 1);
    const state = useDiscoveryWorkspace.getState();
    expect(state.usage.v1.todayFailed).toBe(1);
    expect(state.usage.v2.todaySuccess).toBe(1);
    expect(state.usage.v1.todaySearches).toBe(1);
    // Simulate next UTC day: today counters reset, totals preserved.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${utcDayKey() }T00:00:00Z`).getTime() + 26 * 3600 * 1000);
    useDiscoveryWorkspace.getState().recordSearchSubmitted("v1");
    const rolled = useDiscoveryWorkspace.getState().usage.v1;
    expect(rolled.todaySearches).toBe(1);
    expect(rolled.totalSearches).toBe(2);
    vi.useRealTimers();
  });
});

describe("saved titles (version-aware identity)", () => {
  it("distinguishes identical ids/titles across versions", () => {
    const store = useDiscoveryWorkspace.getState();
    store.saveItem(testItem("v1", "x1", "Same Title"));
    store.saveItem(testItem("v2", "x1", "Same Title"));
    expect(useDiscoveryWorkspace.getState().savedItems).toHaveLength(2);
    expect(store.isItemSaved("v1", "video", "x1")).toBe(true);
    expect(store.isItemSaved("v2", "video", "x1")).toBe(true);
    store.removeItem("v1", "video", "x1");
    const remaining = useDiscoveryWorkspace.getState().savedItems;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].item.apiVersion).toBe("v2");
  });

  it("never auto-saves: explicit saveItem only", () => {
    expect(useDiscoveryWorkspace.getState().savedItems).toHaveLength(0);
  });
});

describe("search history separation", () => {
  it("records per version, deletes individually, clears per version", () => {
    const store = useDiscoveryWorkspace.getState();
    store.addHistory({ version: "v1", resource: "general", label: "v1 q", params: { q: "a" }, resultCount: 1 });
    store.addHistory({ version: "v2", resource: "general", label: "v2 q", params: { profileId: "x" }, resultCount: 2 });
    expect(useDiscoveryWorkspace.getState().history).toHaveLength(2);
    // Deleting an unknown id changes nothing.
    store.removeHistoryEntry("no-such-id");
    expect(useDiscoveryWorkspace.getState().history).toHaveLength(2);
    // Per-version clear removes only that version's records.
    store.clearHistoryForVersion("v1");
    const remaining = useDiscoveryWorkspace.getState().history;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].version).toBe("v2");
    store.removeHistoryEntry(remaining[0].id);
    expect(useDiscoveryWorkspace.getState().history).toHaveLength(0);
  });
});

describe("status countdown", () => {
  it("formats HH:MM:SS, expiry, and missing states", () => {
    const now = new Date("2026-10-11T10:00:00Z").getTime();
    expect(formatCountdown(now + (2 * 3600 + 14 * 60 + 35) * 1000, now)).toBe("Expires in 02:14:35");
    expect(formatCountdown(now - 1000, now)).toBe("Expired");
    expect(formatCountdown(null, now)).toBeNull();
  });
});
