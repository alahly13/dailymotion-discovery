import { describe, expect, it } from "vitest";
import { getCapability, listCapabilities } from "../capability-registry";
import type { DiscoveryResource } from "../types";

const RESOURCES: DiscoveryResource[] = ["general", "videos", "channels", "playlists", "users", "live"];

describe("capability registry", () => {
  it("registers every resource for both versions", () => {
    for (const resource of RESOURCES) {
      expect(getCapability(resource, "v1").version).toBe("v1");
      expect(getCapability(resource, "v2").version).toBe("v2");
    }
    expect(listCapabilities()).toHaveLength(12);
  });

  it("gives every non-global-search entry an alternative workflow", () => {
    for (const entry of listCapabilities()) {
      if (!entry.globalSearch) {
        expect(entry.alternativeWorkflow, `${entry.resource}:${entry.version}`).toMatch(/.{20,}/);
      }
    }
  });

  it("requires auth for all v2 reads and marks public v1 discovery", () => {
    for (const entry of listCapabilities()) {
      if (entry.version === "v2") expect(entry.auth).toBe("required");
    }
    expect(getCapability("general", "v1").auth).toBe("public");
    expect(getCapability("videos", "v1").auth).toBe("public");
    expect(getCapability("live", "v1").auth).toBe("public");
  });

  it("keeps v1 playlist global search unavailable (403 upstream)", () => {
    const playlists = getCapability("playlists", "v1");
    expect(playlists.globalSearch).toBe(false);
    expect(playlists.endpoint).toContain("/user/{owner}/playlists");
  });

  it("uses version-correct pagination models and doc links", () => {
    for (const entry of listCapabilities()) {
      expect(entry.pagination).toBe(entry.version === "v1" ? "v1-page-limit" : "v2-page-cursor");
      expect(entry.docUrl.startsWith("https://developers.dailymotion.com/")).toBe(true);
      expect(entry.pageSizeMax).toBeLessThanOrEqual(100);
    }
  });

  it("throws for unknown pairs instead of silently defaulting", () => {
    expect(() => getCapability("general" as DiscoveryResource, "v3" as "v1")).toThrow();
  });
});
