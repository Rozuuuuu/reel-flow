import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isFeedRoute } from "@/lib/shareUrl";
import { trackEvent } from "@/lib/analytics";

/**
 * If a user lands on a non-feed route (e.g. /search?v=<id>), the reel won't
 * play because that page doesn't render the feed. Forward them to "/" while
 * preserving the ?v= deep link AND any other query params (so e.g. ?tab is
 * carried along too).
 */
export const DeepLinkRedirector = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const videoId = params.get("v");
    if (!videoId) return;
    if (isFeedRoute(location.pathname)) {
      void trackEvent("deep_link_opened", {
        props: { from_path: location.pathname, video_id: videoId },
      });
      return;
    }
    void trackEvent("deep_link_opened", {
      props: {
        from_path: location.pathname,
        video_id: videoId,
        redirected_to_feed: true,
      },
    });
    navigate({ pathname: "/", search: `?${params.toString()}` }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  return null;
};
