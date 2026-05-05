import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readGuestSaves } from "@/hooks/useGuestSaves";
import { useAuth } from "@/contexts/AuthContext";

const PAGE_SIZE = 24;
const SYNCED_FLAG = "reelo:guest-saves-synced";

/** Fetch a single page of saved video IDs for the current user. */
const fetchSavedIdsPage = async (userId: string, from: number, to: number) => {
  const { data, error } = await supabase
    .from("saved_videos")
    .select("video_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []).map((r) => r.video_id as string);
};

/** Returns the full set of saved IDs (cached) — used by VideoCard to know "is saved". */
export const useSavedIds = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved-ids", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_videos")
        .select("video_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.video_id as string));
    },
  });
};

/** Infinite paginated saved-video IDs for the /saved page. */
export const useSavedVideoIdsInfinite = () => {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["saved-ids-infinite", user?.id ?? "anon"],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const ids = await fetchSavedIdsPage(user!.id, from, to);
      return { ids, page: pageParam as number };
    },
    getNextPageParam: (last) =>
      last.ids.length === PAGE_SIZE ? last.page + 1 : undefined,
  });
};

/** Toggle a save on the backend (with optimistic cache update). */
export const useToggleSavedVideo = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    async (videoId: string, currentlySaved: boolean): Promise<boolean> => {
      if (!user) return false;
      setPendingIds((s) => new Set(s).add(videoId));
      try {
        if (currentlySaved) {
          const { error } = await supabase
            .from("saved_videos")
            .delete()
            .eq("user_id", user.id)
            .eq("video_id", videoId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("saved_videos")
            .insert({ user_id: user.id, video_id: videoId });
          if (error && error.code !== "23505") throw error; // ignore unique violation
        }
        // Update cached id-set
        qc.setQueryData<Set<string>>(["saved-ids", user.id], (prev) => {
          const next = new Set(prev ?? []);
          if (currentlySaved) next.delete(videoId);
          else next.add(videoId);
          return next;
        });
        await qc.invalidateQueries({ queryKey: ["saved-ids-infinite", user.id] });
        return !currentlySaved;
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(videoId);
          return next;
        });
      }
    },
    [user, qc],
  );

  const isPending = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return { toggle, isPending };
};

/**
 * On sign-in, migrate any guest (localStorage) saves into the cloud table once.
 * Idempotent — guarded by a localStorage flag scoped to the user id.
 */
export const useGuestSavesSync = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (!user || ran.current) return;
    const flagKey = `${SYNCED_FLAG}:${user.id}`;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(flagKey)) return;

    const localIds = readGuestSaves();
    if (localIds.length === 0) {
      window.localStorage.setItem(flagKey, "1");
      return;
    }
    ran.current = true;
    (async () => {
      try {
        const rows = localIds.map((video_id) => ({
          user_id: user.id,
          video_id,
        }));
        // upsert ignores existing (user_id, video_id) pairs via unique constraint
        await supabase.from("saved_videos").upsert(rows, {
          onConflict: "user_id,video_id",
          ignoreDuplicates: true,
        });
        window.localStorage.setItem(flagKey, "1");
        await qc.invalidateQueries({ queryKey: ["saved-ids", user.id] });
        await qc.invalidateQueries({ queryKey: ["saved-ids-infinite", user.id] });
      } catch {
        // best-effort; will retry on next sign-in
        ran.current = false;
      }
    })();
  }, [user, qc]);
};
