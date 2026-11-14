import { describe, expect, it, vi } from "vitest";
import { redirectToGlobalSearch, redirectToLinkExplorer } from "../discovery-redirect";

// Mock next/navigation redirect
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

describe("discovery route redirection architecture", () => {
  it("redirects legacy video search to global-search with preserved version and query", async () => {
    redirectMock.mockClear();
    const searchParams = Promise.resolve({ q: "wildlife", page: "2" });

    await redirectToGlobalSearch(searchParams, { v: "v1", type: "video" });

    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("/global-search?")
    );
    const calledUrl = redirectMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl, "http://localhost");
    expect(url.searchParams.get("v")).toBe("v1");
    expect(url.searchParams.get("type")).toBe("video");
    expect(url.searchParams.get("q")).toBe("wildlife");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("redirects legacy channel explorer to link-explorer with url parameter mapped", async () => {
    redirectMock.mockClear();
    const searchParams = Promise.resolve({ channel: "lemonde" });

    await redirectToLinkExplorer(searchParams, { v: "v1", defaultKind: "channel" });

    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining("/link-explorer?")
    );
    const calledUrl = redirectMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl, "http://localhost");
    expect(url.searchParams.get("v")).toBe("v1");
    expect(url.searchParams.get("url")).toBe("lemonde");
  });

  it("redirects legacy playlist route to link-explorer with id parameter preserved as url", async () => {
    redirectMock.mockClear();
    const searchParams = Promise.resolve({ id: "x88apm" });

    await redirectToLinkExplorer(searchParams, { v: "v2", defaultKind: "playlist" });

    const calledUrl = redirectMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl, "http://localhost");
    expect(url.searchParams.get("v")).toBe("v2");
    expect(url.searchParams.get("url")).toBe("x88apm");
  });

  it("redirects legacy live route to link-explorer", async () => {
    redirectMock.mockClear();
    const searchParams = Promise.resolve({ id: "x6m7w8" });

    await redirectToLinkExplorer(searchParams, { v: "v1", defaultKind: "livestream" });

    const calledUrl = redirectMock.mock.calls[0][0] as string;
    const url = new URL(calledUrl, "http://localhost");
    expect(url.searchParams.get("v")).toBe("v1");
    expect(url.searchParams.get("url")).toBe("x6m7w8");
  });
});
