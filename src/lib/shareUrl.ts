/**
 * Share-URL construction for reel deep links.
 *
 * Recipients should land on a URL that:
 *   1. Has correct og:* tags for the specific reel (handled by the `r` edge
 *      function, which serves crawler-friendly HTML).
 *   2. Redirects humans to the SPA at a route that actually plays the reel,
 *      preserving the existing search params and always carrying ?v=<id>.
 *
 * Routes that DON'T render the reel feed (e.g. /search, /upload, /profile,
 * /u/<username>, /auth) get rewritten to "/" so the recipient actually sees
 * the video instead of landing on an unrelated page that ignores ?v=.
 */
export const FEED_ROUTES = new Set<string>(["/", "/feed"]);

export const isFeedRoute = (pathname: string): boolean => {
  if (!pathname) return true;
  // Strip trailing slash for comparison ("/feed/" → "/feed")
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return FEED_ROUTES.has(normalized);
};

export interface ShareUrlInput {
  videoId: string;
  /** window.location.origin */
  origin: string;
  /** window.location.pathname */
  pathname: string;
  /** window.location.search (with leading "?") */
  search: string;
  /** import.meta.env.VITE_SUPABASE_URL */
  supabaseUrl?: string | null;
}

export interface BuiltShareUrl {
  /** The user-facing share URL (edge function when available, else direct SPA). */
  shareUrl: string;
  /** The SPA URL the recipient ultimately lands on after the redirect. */
  appReturnUrl: string;
  /** True when the share URL routes through the OG edge function. */
  usesEdgeFunction: boolean;
}

/**
 * Pure, fully testable share-URL builder. Always:
 * - normalizes pathname to a feed route when the current page can't render reels
 * - preserves all OTHER search params (e.g. `?tab=following`)
 * - sets `v=<id>` exactly once, replacing any existing `v` value
 * - URL-encodes everything correctly via URL/URLSearchParams
 */
export const buildShareUrl = ({
  videoId,
  origin,
  pathname,
  search,
  supabaseUrl,
}: ShareUrlInput): BuiltShareUrl => {
  if (!videoId) throw new Error("buildShareUrl: videoId is required");

  // 1. Pick the SPA route the recipient should land on.
  const targetPath = isFeedRoute(pathname) ? pathname || "/" : "/";
  const cleanPath =
    targetPath === "/" ? "/" : targetPath.replace(/\/+$/, "") || "/";

  // 2. Preserve existing search params, but always overwrite ?v=.
  const params = new URLSearchParams(search ?? "");
  params.delete("v");
  params.set("v", videoId);
  const appReturnUrl = `${origin}${cleanPath}?${params.toString()}`;

  // 3. Wrap with the OG edge function when we know the Supabase URL,
  //    so social previews show the reel's actual thumbnail/caption.
  if (!supabaseUrl) {
    return { shareUrl: appReturnUrl, appReturnUrl, usesEdgeFunction: false };
  }

  const fnUrl = new URL(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/r/${encodeURIComponent(
      videoId,
    )}`,
  );
  // The edge function uses ?app=<origin+path> to know where to redirect humans
  // and preserves the trailing ?v= deep-link itself.
  fnUrl.searchParams.set("app", `${origin}${cleanPath}`);
  // Also forward any extra params (like ?tab=following) so the SPA can read them.
  const extras = new URLSearchParams(search ?? "");
  extras.delete("v");
  for (const [k, v] of extras) fnUrl.searchParams.set(`app_${k}`, v);

  return {
    shareUrl: fnUrl.toString(),
    appReturnUrl,
    usesEdgeFunction: true,
  };
};
