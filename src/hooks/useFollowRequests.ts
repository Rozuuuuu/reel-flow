import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

export type FollowRequestStatus = "pending" | "accepted" | "declined";

export interface FollowRequestRow {
  id: string;
  requester_id: string;
  target_id: string;
  status: FollowRequestStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface IncomingFollowRequest extends FollowRequestRow {
  requester: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/** Outgoing requests authored by the current user, keyed by target_id. */
export const useMyOutgoingRequests = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["follow-requests-out", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, FollowRequestRow>> => {
      const { data, error } = await supabase
        .from("follow_requests")
        .select("*")
        .eq("requester_id", userId!);
      if (error) throw error;
      const map: Record<string, FollowRequestRow> = {};
      for (const r of data ?? []) map[r.target_id] = r as FollowRequestRow;
      return map;
    },
  });
};

/** Incoming requests for the current user (with requester profile). */
export const useMyIncomingRequests = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["follow-requests-in", userId],
    enabled: !!userId,
    queryFn: async (): Promise<IncomingFollowRequest[]> => {
      const { data, error } = await supabase
        .from("follow_requests")
        .select("*")
        .eq("target_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as FollowRequestRow[];
      if (rows.length === 0) return [];

      const requesterIds = Array.from(new Set(rows.map((r) => r.requester_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", requesterIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, requester: byId.get(r.requester_id) ?? null }));
    },
  });
};

/** Send a new follow request to `targetUserId`. */
export const useSendFollowRequest = (currentUserId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      targetUserId,
      message,
    }: {
      targetUserId: string;
      message?: string;
    }) => {
      if (!currentUserId) throw new Error("Sign in to send a request");
      if (currentUserId === targetUserId)
        throw new Error("You can't request yourself");

      // If a previous request was declined, allow re-requesting by deleting it first.
      await supabase
        .from("follow_requests")
        .delete()
        .eq("requester_id", currentUserId)
        .eq("target_id", targetUserId)
        .eq("status", "declined");

      const { data, error } = await supabase
        .from("follow_requests")
        .insert({
          requester_id: currentUserId,
          target_id: targetUserId,
          message: message?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as FollowRequestRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["follow-requests-out", currentUserId] });
      toast.success("Request sent");
      void trackEvent("follow_request_sent", {
        userId: currentUserId,
        props: { target_id: row.target_id },
      });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Couldn't send request";
      // Friendlier copy for the unique-pair conflict
      if (msg.toLowerCase().includes("duplicate")) {
        toast.error("You've already sent a request");
      } else {
        toast.error(msg);
      }
    },
  });
};

/** Cancel an outgoing pending request. */
export const useCancelFollowRequest = (currentUserId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!currentUserId) throw new Error("Not signed in");
      const { error } = await supabase
        .from("follow_requests")
        .delete()
        .eq("requester_id", currentUserId)
        .eq("target_id", targetUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow-requests-out", currentUserId] });
      toast.success("Request cancelled");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't cancel"),
  });
};

/** Target accepts/declines an incoming request. Trigger materializes the follow row on accept. */
export const useRespondToFollowRequest = (currentUserId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      status,
    }: {
      requestId: string;
      status: "accepted" | "declined";
    }) => {
      const { error } = await supabase
        .from("follow_requests")
        .update({ status })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["follow-requests-in", currentUserId] });
      qc.invalidateQueries({ queryKey: ["my-following-ids"] });
      toast.success(
        variables.status === "accepted" ? "Follower added" : "Request declined",
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't respond"),
  });
};
