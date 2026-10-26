import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { readGuestSaves } from "@/hooks/useGuestSaves";
import { useVideosByIds, type FeedVideo } from "@/hooks/useVideos";

export interface Recommendation {
  video_id: string;
  reason: string;
}

/**
 * AI-ranked picks for the viewer, from captions, hashtags and their
 * saved/liked reels. Guests pass their local saves; signed-in users are
 * resolved server-side.
 */
export const useRecommendations = (
  interests: string[] | undefined,
  active: boolean,
) => {
  const { user } = useAuth();
  const interestsKey = (interests ?? []).join("|");

  const query = useQuery({
    queryKey: ["recommendations", user?.id ?? "guest", interestsKey],
    enabled: active && !!interests && interests.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<Recommendation[]> => {
      const body: Record<string, unknown> = { interests: interests ?? [] };
      if (!user) body.savedVideoIds = readGuestSaves();
      const { data, error } = await supabase.functions.invoke("recommend-reels", {
        body,
      });
      if (error) throw error;
      const recs = (data as { recommendations?: Recommendation[] } | null)
        ?.recommendations ?? [];
      return recs.filter(
        (r) => r && typeof r.video_id === "string" && typeof r.reason === "string",
      );
    },
  });

  const ids = useMemo(
    () => (query.data ?? []).map((r) => r.video_id),
    [query.data],
  );
  const { data: videos } = useVideosByIds(active ? ids : [], user?.id);

  const ordered = useMemo<FeedVideo[]>(() => {
    if (!videos || videos.length === 0) return [];
    const byId = new Map(videos.map((v) => [v.id, v]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as FeedVideo[];
  }, [ids, videos]);

  const reasonMap = useMemo(
    () =>
      new Map<string, string>((query.data ?? []).map((r) => [r.video_id, r.reason])),
    [query.data],
  );
  const reasonFor = useCallback(
    (id: string | undefined) => (id ? reasonMap.get(id) : undefined),
    [reasonMap],
  );

  return { ...query, recommendations: ordered, reasonFor };
};
