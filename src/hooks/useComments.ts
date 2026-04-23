import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Comment {
  id: string;
  video_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

const PAGE_SIZE = 20;

const topLevelKey = (videoId: string) => ["comments", videoId, "top"];
const repliesKey = (parentId: string) => ["comments-replies", parentId];
const countKey = (videoId: string) => ["comments-count", videoId];
const replyCountKey = (parentId: string) => ["comments-reply-count", parentId];

const attachProfiles = async (rows: Comment[]): Promise<Comment[]> => {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
};

/** Top-level comments, paginated (newest first). */
export const useTopLevelComments = (videoId: string | undefined) => {
  return useInfiniteQuery({
    queryKey: topLevelKey(videoId ?? ""),
    enabled: !!videoId,
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    queryFn: async ({ pageParam }): Promise<Comment[]> => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("video_id", videoId!)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return await attachProfiles((data ?? []) as Comment[]);
    },
  });
};

/** Replies to a single parent comment (oldest first, lazy-loaded). */
export const useReplies = (parentId: string | undefined, enabled: boolean) => {
  return useQuery({
    queryKey: repliesKey(parentId ?? ""),
    enabled: !!parentId && enabled,
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("parent_id", parentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return await attachProfiles((data ?? []) as Comment[]);
    },
  });
};

export const useReplyCount = (parentId: string) => {
  return useQuery({
    queryKey: replyCountKey(parentId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", parentId);
      if (error) throw error;
      return count ?? 0;
    },
  });
};

export const useCommentCount = (videoId: string | undefined) => {
  return useQuery({
    queryKey: countKey(videoId ?? ""),
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
    mutationFn: async ({
      userId,
      body,
      parentId,
    }: {
      userId: string;
      body: string;
      parentId?: string | null;
    }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Comment is empty");
      const { data, error } = await supabase
        .from("comments")
        .insert({
          video_id: videoId,
          user_id: userId,
          body: trimmed,
          parent_id: parentId ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      if (vars.parentId) {
        qc.invalidateQueries({ queryKey: repliesKey(vars.parentId) });
        qc.invalidateQueries({ queryKey: replyCountKey(vars.parentId) });
      } else {
        qc.invalidateQueries({ queryKey: topLevelKey(videoId) });
      }
      qc.invalidateQueries({ queryKey: countKey(videoId) });
    },
  });
};

export const useUpdateComment = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Comment is empty");
      const { data, error } = await supabase
        .from("comments")
        .update({ body: trimmed })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, _vars) => {
      qc.invalidateQueries({ queryKey: topLevelKey(videoId) });
      qc.invalidateQueries({ queryKey: ["comments-replies"] });
    },
  });
};

export const useDeleteComment = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
      return { parentId };
    },
    onSuccess: ({ parentId }) => {
      if (parentId) {
        qc.invalidateQueries({ queryKey: repliesKey(parentId) });
        qc.invalidateQueries({ queryKey: replyCountKey(parentId) });
      } else {
        qc.invalidateQueries({ queryKey: topLevelKey(videoId) });
      }
      qc.invalidateQueries({ queryKey: countKey(videoId) });
    },
  });
};

/** Moderator-only: hide a comment (sets hidden_at). Owners may unhide their own. */
export const useToggleHideComment = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hide }: { id: string; hide: boolean }) => {
      const { error } = await supabase
        .from("comments")
        .update({ hidden_at: hide ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: topLevelKey(videoId) });
      qc.invalidateQueries({ queryKey: ["comments-replies"] });
    },
  });
};

export const useReportComment = () => {
  return useMutation({
    mutationFn: async ({
      commentId,
      reporterId,
      reason,
    }: {
      commentId: string;
      reporterId: string;
      reason: string;
    }) => {
      const { error } = await supabase.from("comment_reports").insert({
        comment_id: commentId,
        reporter_id: reporterId,
        reason: reason.trim().slice(0, 500),
      });
      if (error) throw error;
    },
  });
};

/** True if the current user is a moderator or admin. */
export const useIsModerator = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["is-moderator", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .in("role", ["admin", "moderator"]);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
};

/** Realtime: invalidate any affected comment queries for a single video. */
export const useCommentsRealtime = (videoId: string | undefined) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!videoId) return;
    const channel = supabase
      .channel(`comments:${videoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `video_id=eq.${videoId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { parent_id: string | null } | undefined;
          if (row?.parent_id) {
            qc.invalidateQueries({ queryKey: repliesKey(row.parent_id) });
            qc.invalidateQueries({ queryKey: replyCountKey(row.parent_id) });
          } else {
            qc.invalidateQueries({ queryKey: topLevelKey(videoId) });
          }
          qc.invalidateQueries({ queryKey: countKey(videoId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, qc]);
};
