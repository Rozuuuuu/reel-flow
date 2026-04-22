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

export type VideoStatus = "available" | "private" | "removed" | "not_found";

export interface VideoByIdResult {
  status: VideoStatus;
  video: FeedVideo | null;
}

export const useVideoById = (videoId: string | undefined, currentUserId: string | undefined) => {
  return useQuery({
    queryKey: ["video-by-id", videoId, currentUserId ?? "anon"],
    enabled: !!videoId,
    retry: 1,
    queryFn: async (): Promise<VideoByIdResult> => {
      const { data: video, error } = await supabase
        .from("videos")
        .select("*")
        .eq("id", videoId!)
        .maybeSingle();
      if (error) throw error;

      if (!video) {
        // RLS hides private/removed videos from non-owners — ask the edge
        // function (service-role) to tell us which case this actually is.
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-status?id=${encodeURIComponent(videoId!)}`;
          const res = await fetch(url, {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          });
          if (res.ok) {
            const json = (await res.json()) as { status?: VideoStatus };
            return { status: json.status ?? "not_found", video: null };
          }
        } catch {
          // ignore — fall through to not_found
        }
        return { status: "not_found", video: null };
      }

      const [profileRes, likesCountRes, myLikeRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", video.user_id)
          .maybeSingle(),
        supabase
          .from("likes")
          .select("video_id", { count: "exact", head: true })
          .eq("video_id", video.id),
        currentUserId
          ? supabase
              .from("likes")
              .select("video_id")
              .eq("user_id", currentUserId)
              .eq("video_id", video.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
      ]);

      return {
        status: "available",
        video: {
          ...video,
          hashtags: video.hashtags ?? [],
          profile: profileRes.data ?? null,
          likes_count: likesCountRes.count ?? 0,
          liked_by_me: !!myLikeRes.data,
        },
      };
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
