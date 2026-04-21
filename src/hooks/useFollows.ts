import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// IDs of people the current user follows
export const useMyFollowingIds = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["my-following-ids", userId],
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.following_id);
    },
  });
};

export const toggleFollow = async (
  currentUserId: string,
  targetUserId: string,
  isFollowing: boolean,
  qc: ReturnType<typeof useQueryClient>
) => {
  if (currentUserId === targetUserId) return;

  // optimistic
  qc.setQueryData<string[]>(["my-following-ids", currentUserId], (old) => {
    const list = old ?? [];
    return isFollowing ? list.filter((id) => id !== targetUserId) : [...list, targetUserId];
  });

  if (isFollowing) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", currentUserId)
      .eq("following_id", targetUserId);
    if (error) {
      toast.error("Couldn't unfollow");
      qc.invalidateQueries({ queryKey: ["my-following-ids", currentUserId] });
    }
  } else {
    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: currentUserId, following_id: targetUserId });
    if (error && !error.message.includes("duplicate")) {
      toast.error("Couldn't follow");
      qc.invalidateQueries({ queryKey: ["my-following-ids", currentUserId] });
    }
  }
  qc.invalidateQueries({ queryKey: ["feed-videos"] });
};
