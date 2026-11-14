import { describe, expect, it } from "vitest";
import {
  analyzeDailymotionChannelInput,
  analyzeDailymotionUrlOrId,
} from "../dailymotion-url-analyzer";

describe("analyzeDailymotionUrlOrId", () => {
  it("rejects empty inputs gracefully", () => {
    const result = analyzeDailymotionUrlOrId("");
    expect(result.kind).toBe("unsupported");
    expect(result.reason).toContain("Please enter a Dailymotion URL");
  });

  it("rejects non-allowlisted domains to prevent SSRF", () => {
    const malicious = analyzeDailymotionUrlOrId("https://attacker.com/video/x8n8x8");
    expect(malicious.kind).toBe("unsupported");
    expect(malicious.reason).toContain("Only Dailymotion URLs");

    const youtube = analyzeDailymotionUrlOrId("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(youtube.kind).toBe("unsupported");
    expect(youtube.reason).toContain("Only Dailymotion URLs");
  });

  it("analyzes standard video URLs and slugs", () => {
    const video = analyzeDailymotionUrlOrId("https://www.dailymotion.com/video/x8n8x8");
    expect(video.kind).toBe("video");
    expect(video.identifier).toBe("x8n8x8");
    expect(video.videoId).toBe("x8n8x8");
    expect(video.canonicalUrl).toBe("https://www.dailymotion.com/video/x8n8x8");
    expect(video.apiPathV1).toBe("/video/x8n8x8");
    expect(video.apiPathV2).toBe("/v2/videos/x8n8x8");

    const withSlug = analyzeDailymotionUrlOrId("https://www.dailymotion.com/video/x8n8x8_highlights-champions-league");
    expect(withSlug.kind).toBe("video");
    expect(withSlug.identifier).toBe("x8n8x8");
  });

  it("analyzes short dai.ly URLs", () => {
    const short = analyzeDailymotionUrlOrId("https://dai.ly/x7xyz9");
    expect(short.kind).toBe("video");
    expect(short.identifier).toBe("x7xyz9");
    expect(short.canonicalUrl).toBe("https://www.dailymotion.com/video/x7xyz9");
  });

  it("analyzes playlist URLs and parameters", () => {
    const playlist = analyzeDailymotionUrlOrId("https://www.dailymotion.com/playlist/x88apm");
    expect(playlist.kind).toBe("playlist");
    expect(playlist.identifier).toBe("x88apm");
    expect(playlist.playlistId).toBe("x88apm");
    expect(playlist.canonicalUrl).toBe("https://www.dailymotion.com/playlist/x88apm");
    expect(playlist.apiPathV1).toBe("/playlist/x88apm/videos");
    expect(playlist.apiPathV2).toBe("/v2/playlists/x88apm");

    const videoInPlaylist = analyzeDailymotionUrlOrId("https://www.dailymotion.com/video/x8n8x8?playlist=x88apm");
    expect(videoInPlaylist.kind).toBe("video");
    expect(videoInPlaylist.videoId).toBe("x8n8x8");
    expect(videoInPlaylist.playlistId).toBe("x88apm");
  });

  it("analyzes live stream URLs", () => {
    const live = analyzeDailymotionUrlOrId("https://www.dailymotion.com/live/x6abc12");
    expect(live.kind).toBe("livestream");
    expect(live.identifier).toBe("x6abc12");
    expect(live.canonicalUrl).toBe("https://www.dailymotion.com/live/x6abc12");
    expect(live.apiPathV2).toBe("/v2/livestreams/x6abc12");
  });

  it("analyzes channels, users, and handles", () => {
    const channel = analyzeDailymotionUrlOrId("https://www.dailymotion.com/channel/lemonde");
    expect(channel.kind).toBe("channel");
    expect(channel.identifier).toBe("lemonde");
    expect(channel.apiPathV1).toBe("/channel/lemonde/videos");
    expect(channel.apiPathV2).toBe("/v2/profiles/lemonde/videos");

    const user = analyzeDailymotionUrlOrId("https://www.dailymotion.com/user/lequipe");
    expect(user.kind).toBe("user");
    expect(user.identifier).toBe("lequipe");

    const handle = analyzeDailymotionUrlOrId("@lemonde");
    expect(handle.kind).toBe("channel");
    expect(handle.identifier).toBe("lemonde");
  });

  it("analyzes search URLs", () => {
    const search = analyzeDailymotionUrlOrId("https://www.dailymotion.com/search/breaking%20news");
    expect(search.kind).toBe("search");
    expect(search.identifier).toBe("breaking news");
    expect(search.apiPathV1).toBe("/videos?search=breaking%20news");
    expect(search.apiPathV2).toBeNull();
  });

  it("analyzes multi-word and non-slug search queries (Arabic, Unicode, phrases)", () => {
    const arabicQuery = analyzeDailymotionUrlOrId("رقص افراح شعبيه مصرى");
    expect(arabicQuery.kind).toBe("search");
    expect(arabicQuery.identifier).toBe("رقص افراح شعبيه مصرى");
    expect(arabicQuery.apiPathV1).toBe(`/videos?search=${encodeURIComponent("رقص افراح شعبيه مصرى")}`);
    expect(arabicQuery.apiPathV2).toBeNull();
    expect(arabicQuery.warnings.some((w) => w.code === "v2_no_global_search")).toBe(true);

    const englishPhrase = analyzeDailymotionUrlOrId("popular wedding music");
    expect(englishPhrase.kind).toBe("search");
    expect(englishPhrase.identifier).toBe("popular wedding music");
    expect(englishPhrase.apiPathV1).toBe(`/videos?search=${encodeURIComponent("popular wedding music")}`);
    expect(englishPhrase.apiPathV2).toBeNull();

    const singleUnicode = analyzeDailymotionUrlOrId("مصر");
    expect(singleUnicode.kind).toBe("search");
    expect(singleUnicode.identifier).toBe("مصر");
  });

  it("analyzes explicit type prefixes", () => {
    const prefVideo = analyzeDailymotionUrlOrId("video:x123abc");
    expect(prefVideo.kind).toBe("video");
    expect(prefVideo.identifier).toBe("x123abc");

    const prefPlaylist = analyzeDailymotionUrlOrId("playlist:x999xyz");
    expect(prefPlaylist.kind).toBe("playlist");
    expect(prefPlaylist.identifier).toBe("x999xyz");

    const prefLive = analyzeDailymotionUrlOrId("live:x444live");
    expect(prefLive.kind).toBe("livestream");
    expect(prefLive.identifier).toBe("x444live");
  });

  it("preserves backwards compatibility of analyzeDailymotionChannelInput", () => {
    const analysis = analyzeDailymotionChannelInput("https://www.dailymotion.com/lemonde");
    expect(analysis.sourceType).toBe("username");
    expect(analysis.resolvedIdentifier).toBe("lemonde");
    expect(analysis.apiPath).toBe("/user/lemonde/videos");
  });
});
