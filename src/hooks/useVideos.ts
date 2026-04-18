import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FeedVideo {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[];
  views_count: number;
  created_at: string;
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  likes_count: number;
  liked_by_me: boolean;
}

export const useFeedVideos = (currentUserId: string | undefined) => {
  return useQuery({
    queryKey: ["feed-videos", currentUserId ?? "anon"],
    queryFn: async (): Promise<FeedVideo[]> => {
      const { data: videos, error } = await supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!videos || videos.length === 0) return [];

      const userIds = Array.from(new Set(videos.map((v) => v.user_id)));
      const videoIds = videos.map((v) => v.id);

      const [profilesRes, likesRes, myLikesRes] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds),
        supabase.from("likes").select("video_id").in("video_id", videoIds),
        currentUserId
          ? supabase.from("likes").select("video_id").eq("user_id", currentUserId).in("video_id", videoIds)
          : Promise.resolve({ data: [] as { video_id: string }[], error: null }),
      ]);

      const profileById = new Map(
        (profilesRes.data ?? []).map((p) => [p.id, p])
      );
      const likeCountByVideo = new Map<string, number>();
      (likesRes.data ?? []).forEach((l) => {
        likeCountByVideo.set(l.video_id, (likeCountByVideo.get(l.video_id) ?? 0) + 1);
      });
      const myLikedSet = new Set((myLikesRes.data ?? []).map((l) => l.video_id));

      return videos.map((v) => ({
        ...v,
        hashtags: v.hashtags ?? [],
        profile: profileById.get(v.user_id) ?? null,
        likes_count: likeCountByVideo.get(v.id) ?? 0,
        liked_by_me: myLikedSet.has(v.id),
      }));
    },
  });
};

export const useMyVideos = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["my-videos", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useMyProfile = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};
