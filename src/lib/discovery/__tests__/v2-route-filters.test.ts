import { describe, expect, it, vi } from "vitest";
import { GET as v2GetHandler } from "@/app/api/discovery/v2/[resource]/route";

const mockProfileVideos = vi.fn(async () => ({
  ok: true as const,
  result: { items: [], page: 1, pageSize: 20, total: 0, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2" as const, resource: "videos" as const, endpoint: "GET /profiles/{profile_id}/videos" },
}));

const mockGetVideo = vi.fn(async () => ({
  ok: true as const,
  result: { items: [], page: 1, pageSize: 1, total: 0, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2" as const, resource: "videos" as const, endpoint: "GET /videos/{id}" },
}));

vi.mock("@/lib/discovery/v2-search-service", () => ({
  v2ProfileVideos: (...args: Parameters<typeof mockProfileVideos>) => mockProfileVideos(...args),
  v2GetVideo: (...args: Parameters<typeof mockGetVideo>) => mockGetVideo(...args),
  v2GetProfile: vi.fn(),
  v2Me: vi.fn(),
  v2ProfilePlaylists: vi.fn(),
  v2GetPlaylist: vi.fn(),
  v2PlaylistVideos: vi.fn(),
  v2GetUser: vi.fn(),
  v2ProfileLivestreams: vi.fn(),
  v2GetLivestream: vi.fn(),
}));

describe("API v2 discovery route parameter forwarding", () => {
  it("forwards isExplicit, isForKids, and fields for profile video browsing", async () => {
    const req = new Request(
      "http://localhost:3000/api/discovery/v2/videos?profileId=x123&isExplicit=false&isForKids=true&fields=video_id,title",
    );
    const res = await v2GetHandler(req, { params: Promise.resolve({ resource: "videos" }) });
    expect(res.status).toBe(200);
    expect(mockProfileVideos).toHaveBeenCalledWith(
      "x123",
      expect.objectContaining({
        isExplicit: false,
        isForKids: true,
        fields: "video_id,title",
      }),
      "videos",
    );
  });

  it("forwards optional fields for direct v2 video lookup", async () => {
    const req = new Request(
      "http://localhost:3000/api/discovery/v2/videos?mode=lookup&id=xabc&fields=video_id,title,tags",
    );
    const res = await v2GetHandler(req, { params: Promise.resolve({ resource: "videos" }) });
    expect(res.status).toBe(200);
    expect(mockGetVideo).toHaveBeenCalledWith("xabc", "video_id,title,tags");
  });
});
