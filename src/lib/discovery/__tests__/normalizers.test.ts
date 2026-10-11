import { describe, expect, it } from "vitest";
import {
  normalizeV1Channel,
  normalizeV1Playlist,
  normalizeV1User,
  normalizeV1Video,
  normalizeV1Videos,
} from "../v1-normalize";
import {
  normalizeV2Livestream,
  normalizeV2Playlist,
  normalizeV2Profile,
  normalizeV2Video,
  normalizeV2Videos,
} from "../v2-normalize";
import { mergeDiscoveryItems } from "../types";

describe("v1 normalizer", () => {
  it("maps legacy fields and stamps apiVersion v1", () => {
    const item = normalizeV1Video({
      id: "x5auisp",
      title: "Some news",
      created_time: 1486444210,
      channel: "news",
      owner: "x16injb",
      "owner.screenname": "L'Équipe",
      tags: "a,b",
    });
    expect(item?.apiVersion).toBe("v1");
    expect(item?.kind).toBe("video");
    expect(item?.createdAt).toBe("2017-02-07T05:10:10.000Z");
    expect(item?.category).toBe("news");
    expect(item?.ownerName).toBe("L'Équipe");
    expect(item?.tags).toEqual(["a", "b"]);
    expect(item?.url).toBe("https://www.dailymotion.com/video/x5auisp");
  });

  it("returns null without an id and dedupes lists", () => {
    expect(normalizeV1Video({ title: "no id" })).toBeNull();
    const items = normalizeV1Videos([{ id: "x1", title: "a" }, { id: "x1", title: "a-dup" }, { id: "x2" }]);
    expect(items.map((i) => i.id)).toEqual(["x1", "x2"]);
  });

  it("normalizes users, channels, and playlists distinctly", () => {
    const user = normalizeV1User({ id: "x6cbgw6", username: "u", screenname: "U", videos_total: 2 });
    const channel = normalizeV1Channel({ id: "x6cbgw6", username: "u", screenname: "U" });
    const playlist = normalizeV1Playlist({ id: "x88apm", name: "P", videos_total: 40 });
    expect(user?.kind).toBe("user");
    expect(channel?.kind).toBe("channel");
    expect(user?.extra.videosTotal).toBe(2);
    expect(playlist?.kind).toBe("playlist");
    expect(playlist?.extra.videosTotal).toBe(40);
    for (const item of [user, channel, playlist]) expect(item?.apiVersion).toBe("v1");
  });
});

describe("v2 normalizer", () => {
  it("maps v2 fields (video_id, ISO dates, nested profile/source) and stamps v2", () => {
    const item = normalizeV2Video({
      video_id: "x8abc123",
      title: "Keynote",
      created_at: "2024-06-01T14:30:00Z",
      category: "tech",
      source: { duration: 125 },
      profile: { profile_id: "x1y2z3", name: "official", display_name: "Official" },
      thumbnail: { h720_url: "https://example.com/t.jpg" },
      video_url: "https://www.dailymotion.com/video/x8abc123",
    });
    expect(item?.apiVersion).toBe("v2");
    expect(item?.id).toBe("x8abc123");
    expect(item?.createdAt).toBe("2024-06-01T14:30:00.000Z");
    expect(item?.duration).toBe(125);
    expect(item?.ownerName).toBe("Official");
    expect(item?.thumbnail).toBe("https://example.com/t.jpg");
  });

  it("rejects invalid ISO dates and missing ids", () => {
    expect(normalizeV2Video({ title: "no id" })).toBeNull();
    const item = normalizeV2Video({ video_id: "x1", created_at: "bogus" });
    expect(item?.createdAt).toBeNull();
    expect(item?.year).toBeNull();
  });

  it("normalizes profiles, playlists, livestreams with v2 stamp", () => {
    expect(normalizeV2Profile({ profile_id: "x1" })?.apiVersion).toBe("v2");
    expect(normalizeV2Playlist({ playlist_id: "p1" })?.kind).toBe("playlist");
    expect(normalizeV2Livestream({ livestream_id: "l1", status: "live" })?.extra.status).toBe("live");
    const dupes = normalizeV2Videos([{ video_id: "x1" }, { video_id: "x1" }]);
    expect(dupes).toHaveLength(1);
  });
});

describe("cross-version separation", () => {
  it("never merges v1 and v2 records with the same id", () => {
    const v1 = normalizeV1Video({ id: "x1", title: "v1" });
    const v2 = normalizeV2Video({ video_id: "x1", title: "v2" });
    const merged = mergeDiscoveryItems([v1!], [v2!]);
    expect(merged).toHaveLength(2);
    expect(merged.map((i) => i.apiVersion).sort()).toEqual(["v1", "v2"]);
  });

  it("dedupes within a version while preserving order", () => {
    const a = normalizeV1Video({ id: "x1" });
    const b = normalizeV1Video({ id: "x2" });
    const merged = mergeDiscoveryItems([a!], [a!, b!]);
    expect(merged.map((i) => i.id)).toEqual(["x1", "x2"]);
  });
});
