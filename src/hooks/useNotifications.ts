import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "comment_reply"
  | "follow_request"
  | "follow_accepted";

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  comment_id: string | null;
  video_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

const listKey = (userId: string) => ["notifications", userId];
const countKey = (userId: string) => ["notifications-unread-count", userId];

export const useNotifications = (userId: string | undefined) => {
  return useQuery({
    queryKey: listKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as AppNotification[];
      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]),
      );
      if (actorIds.length === 0) {
        return rows.map((r) => ({ ...r, actor: null }));
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", actorIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        actor: r.actor_id ? byId.get(r.actor_id) ?? null : null,
      }));
    },
  });
};

export const useUnreadNotificationCount = (userId: string | undefined) => {
  return useQuery({
    queryKey: countKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
};

export const useMarkNotificationRead = (userId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!userId) return;
      qc.invalidateQueries({ queryKey: listKey(userId) });
      qc.invalidateQueries({ queryKey: countKey(userId) });
    },
  });
};

export const useMarkAllNotificationsRead = (userId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!userId) return;
      qc.invalidateQueries({ queryKey: listKey(userId) });
      qc.invalidateQueries({ queryKey: countKey(userId) });
    },
  });
};

/** Realtime — keep notification list + unread count fresh. */
export const useNotificationsRealtime = (userId: string | undefined) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: listKey(userId) });
          qc.invalidateQueries({ queryKey: countKey(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
};
