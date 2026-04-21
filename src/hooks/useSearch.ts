import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useDebounce = <T,>(value: T, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

export interface UserResult {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface VideoResult {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[];
  views_count: number;
  created_at: string;
  profile: { username: string; avatar_url: string | null } | null;
}

export interface HashtagResult {
  tag: string;
  count: number;
  sample_thumbnail: string | null;
}

export const useSearchUsers = (query: string) => {
  return useQuery({
    queryKey: ["search-users", query],
    enabled: query.trim().length > 0,
    queryFn: async (): Promise<UserResult[]> => {
      const q = query.trim();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useSearchVideos = (query: string) => {
  return useQuery({
    queryKey: ["search-videos", query],
    enabled: query.trim().length > 0,
    queryFn: async (): Promise<VideoResult[]> => {
      const q = query.trim();
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .ilike("caption", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const videos = data ?? [];
      if (videos.length === 0) return [];

      const userIds = Array.from(new Set(videos.map((v) => v.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

      return videos.map((v) => ({
        ...v,
        hashtags: v.hashtags ?? [],
        profile: byId.get(v.user_id)
          ? { username: byId.get(v.user_id)!.username, avatar_url: byId.get(v.user_id)!.avatar_url }
          : null,
      }));
    },
  });
};

export const useSearchHashtags = (query: string) => {
  return useQuery({
    queryKey: ["search-hashtags", query],
    enabled: query.trim().length > 0,
    queryFn: async (): Promise<HashtagResult[]> => {
      const q = query.trim().replace(/^#/, "").toLowerCase();
      // Fetch a window of recent videos and aggregate client-side
      const { data, error } = await supabase
        .from("videos")
        .select("hashtags, thumbnail_url")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const counts = new Map<string, { count: number; thumb: string | null }>();
      (data ?? []).forEach((v) => {
        (v.hashtags ?? []).forEach((tag) => {
          const t = tag.toLowerCase();
          if (!t.includes(q)) return;
          const existing = counts.get(t);
          if (existing) {
            existing.count += 1;
          } else {
            counts.set(t, { count: 1, thumb: v.thumbnail_url });
          }
        });
      });
      return Array.from(counts.entries())
        .map(([tag, { count, thumb }]) => ({ tag, count, sample_thumbnail: thumb }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
    },
  });
};
