import { beforeEach, describe, expect, it } from "vitest";
import {
  captureSearchSubmission,
  captureLinkSubmission,
  captureDiscoverySubmission,
  setCachedClientOwnerId,
  getClientOwnerId,
} from "../capture-service";
import { getAllOwnerSavedTitles } from "../local-storage";

describe("Saved Titles — Centralized Automatic Capture Service", () => {
  const testOwner = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    setCachedClientOwnerId(testOwner);
  });

  describe("getClientOwnerId and caching", () => {
    it("returns the set owner ID", async () => {
      setCachedClientOwnerId("custom-test-owner");
      const id = await getClientOwnerId();
      expect(id).toBe("custom-test-owner");
    });
  });

  describe("captureSearchSubmission", () => {
    it("ignores empty or whitespace-only search queries", async () => {
      const emptyResult = await captureSearchSubmission("", "v1", testOwner);
      const whitespaceResult = await captureSearchSubmission("   \t\n  ", "v2", testOwner);

      expect(emptyResult).toBeNull();
      expect(whitespaceResult).toBeNull();
    });

    it("captures valid search query with v1 api provenance", async () => {
      const entry = await captureSearchSubmission("quantum computing", "v1", testOwner);

      expect(entry).not.toBeNull();
      expect(entry!.kind).toBe("search_query");
      expect(entry!.value).toBe("quantum computing");
      expect(entry!.displayTitle).toBe("quantum computing");
      expect(entry!.source.workspace).toBe("global-search");
      expect(entry!.source.label).toBe("Global Search");
      expect(entry!.source.apiVersion).toBe("v1");
      expect(entry!.addedBy.type).toBe("search-action");
      expect(entry!.status).toBe("pending_sync");
      expect(entry!.ownerId).toBe(testOwner);

      // Verify persisted in owner's local storage
      const stored = await getAllOwnerSavedTitles(testOwner);
      expect(stored.some((item) => item.id === entry!.id)).toBe(true);
    });

    it("captures valid search query with v2 api provenance", async () => {
      const entry = await captureSearchSubmission("nature documentary 4k", "v2", testOwner);

      expect(entry).not.toBeNull();
      expect(entry!.source.apiVersion).toBe("v2");
      expect(entry!.value).toBe("nature documentary 4k");
      expect(entry!.status).toBe("pending_sync");
    });
  });

  describe("captureLinkSubmission", () => {
    it("ignores empty or whitespace-only inputs", async () => {
      const result = await captureLinkSubmission("   ", "v1", undefined, testOwner);
      expect(result).toBeNull();
    });

    it("captures full Dailymotion video URL and derives canonical information", async () => {
      const url = "https://www.dailymotion.com/video/x8n8x8";
      const entry = await captureLinkSubmission(url, "v2", undefined, testOwner);

      expect(entry).not.toBeNull();
      expect(entry!.kind).toBe("url");
      expect(entry!.value).toBe(url);
      expect(entry!.source.workspace).toBe("link-explorer");
      expect(entry!.source.label).toBe("Link Explorer");
      expect(entry!.source.apiVersion).toBe("v2");
      expect(entry!.resourceType).toBe("video");
      expect(entry!.canonicalUrl).toContain("dailymotion.com/video/x8n8x8");
      expect(entry!.addedBy.type).toBe("link-action");
      expect(entry!.status).toBe("pending_sync");
    });

    it("captures channel handle correctly as handle kind", async () => {
      const handle = "@lemonde";
      const entry = await captureLinkSubmission(handle, "v1", undefined, testOwner);

      expect(entry).not.toBeNull();
      expect(entry!.kind).toBe("handle");
      expect(entry!.value).toBe("@lemonde");
      expect(entry!.source.workspace).toBe("link-explorer");
    });

    it("captures raw resource ID correctly as resource_id kind", async () => {
      const rawId = "x8n8x8";
      const entry = await captureLinkSubmission(rawId, "v1", undefined, testOwner);

      expect(entry).not.toBeNull();
      expect(entry!.kind).toBe("resource_id");
      expect(entry!.value).toBe("x8n8x8");
      expect(entry!.source.workspace).toBe("link-explorer");
    });
  });

  describe("captureDiscoverySubmission", () => {
    it("captures custom discovery input with designated workspace and label", async () => {
      const entry = await captureDiscoverySubmission(
        "channel:lemonde",
        "channels-workspace",
        "Channel Explorer",
        "v2",
        testOwner
      );

      expect(entry).not.toBeNull();
      expect(entry!.source.workspace).toBe("channels-workspace");
      expect(entry!.source.label).toBe("Channel Explorer");
      expect(entry!.source.apiVersion).toBe("v2");
      expect(entry!.addedBy.type).toBe("channel-action");
      expect(entry!.status).toBe("pending_sync");
    });
  });
});
