import { describe, expect, it } from "vitest";
import { buildShareUrl, isFeedRoute } from "./shareUrl";

const SUPA = "https://example.supabase.co";

describe("isFeedRoute", () => {
  it("treats /, /feed, /feed/ as feed routes", () => {
    expect(isFeedRoute("/")).toBe(true);
    expect(isFeedRoute("/feed")).toBe(true);
    expect(isFeedRoute("/feed/")).toBe(true);
  });
  it("rejects non-feed routes", () => {
    expect(isFeedRoute("/search")).toBe(false);
    expect(isFeedRoute("/profile")).toBe(false);
    expect(isFeedRoute("/u/alice")).toBe(false);
    expect(isFeedRoute("/auth")).toBe(false);
  });
});

describe("buildShareUrl", () => {
  it("always includes ?v=<id> and routes through the edge function", () => {
    const { shareUrl, appReturnUrl, usesEdgeFunction } = buildShareUrl({
      videoId: "abc123",
      origin: "https://app.example.com",
      pathname: "/",
      search: "",
      supabaseUrl: SUPA,
    });
    expect(usesEdgeFunction).toBe(true);
    expect(shareUrl).toContain("/functions/v1/r/abc123");
    expect(appReturnUrl).toBe("https://app.example.com/?v=abc123");
    expect(new URL(shareUrl).searchParams.get("app")).toBe(
      "https://app.example.com/",
    );
  });

  it("preserves existing query params and replaces an existing v=", () => {
    const { appReturnUrl } = buildShareUrl({
      videoId: "new-id",
      origin: "https://app.example.com",
      pathname: "/feed",
      search: "?tab=following&v=stale-id&utm=x",
      supabaseUrl: SUPA,
    });
    const u = new URL(appReturnUrl);
    expect(u.pathname).toBe("/feed");
    expect(u.searchParams.get("v")).toBe("new-id");
    expect(u.searchParams.get("tab")).toBe("following");
    expect(u.searchParams.get("utm")).toBe("x");
    // No duplicate v
    expect(u.searchParams.getAll("v")).toEqual(["new-id"]);
  });

  it("rewrites non-feed routes (search/profile/u) to / so reel actually plays", () => {
    for (const pathname of ["/search", "/profile", "/u/alice", "/upload"]) {
      const { appReturnUrl } = buildShareUrl({
        videoId: "vid",
        origin: "https://app.example.com",
        pathname,
        search: "?q=cats",
        supabaseUrl: SUPA,
      });
      const u = new URL(appReturnUrl);
      expect(u.pathname).toBe("/");
      expect(u.searchParams.get("v")).toBe("vid");
      // Non-v params from the originating page are preserved
      expect(u.searchParams.get("q")).toBe("cats");
    }
  });

  it("falls back to direct SPA URL when supabaseUrl is missing", () => {
    const { shareUrl, usesEdgeFunction } = buildShareUrl({
      videoId: "x",
      origin: "https://a.com",
      pathname: "/",
      search: "",
      supabaseUrl: null,
    });
    expect(usesEdgeFunction).toBe(false);
    expect(shareUrl).toBe("https://a.com/?v=x");
  });

  it("URL-encodes the video id in the edge function path", () => {
    const { shareUrl } = buildShareUrl({
      videoId: "weird id/with?stuff",
      origin: "https://a.com",
      pathname: "/",
      search: "",
      supabaseUrl: SUPA,
    });
    // The video id is encoded inside the function path
    expect(shareUrl).toContain(
      "/functions/v1/r/weird%20id%2Fwith%3Fstuff",
    );
  });

  it("throws on missing videoId", () => {
    expect(() =>
      buildShareUrl({
        videoId: "",
        origin: "https://a.com",
        pathname: "/",
        search: "",
      }),
    ).toThrow();
  });
});
