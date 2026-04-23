import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Comment {
  id: string;
  video_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

const commentsKey = (videoId: string) => ["comments", videoId];

export const useComments = (videoId: string | undefined) => {
  return useQuery({
    queryKey: commentsKey(videoId ?? ""),
    enabled: !!videoId,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("video_id", videoId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        profile: byId.get(r.user_id) ?? null,
      }));
    },
  });
};

export const useCommentCount = (videoId: string | undefined) => {
  return useQuery({
    queryKey: ["comments-count", videoId],
    enabled: !!videoId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("video_id", videoId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
};

export const useAddComment = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body: string }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Comment is empty");
      const { data, error } = await supabase
        .from("comments")
        .insert({ video_id: videoId, user_id: userId, body: trimmed })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(videoId) });
      qc.invalidateQueries({ queryKey: ["comments-count", videoId] });
    },
  });
};

export const useDeleteComment = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsKey(videoId) });
      qc.invalidateQueries({ queryKey: ["comments-count", videoId] });
    },
  });
};

/** Subscribe to realtime inserts/deletes for a single video's comments. */
export const useCommentsRealtime = (videoId: string | undefined) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!videoId) return;
    const channel = supabase
      .channel(`comments:${videoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `video_id=eq.${videoId}` },
        () => {
          qc.invalidateQueries({ queryKey: commentsKey(videoId) });
          qc.invalidateQueries({ queryKey: ["comments-count", videoId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, qc]);
};
