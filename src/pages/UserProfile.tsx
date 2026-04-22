import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FollowButton } from "@/components/FollowButton";
import {
  useMyOutgoingRequests,
  useSendFollowRequest,
  useCancelFollowRequest,
} from "@/hooks/useFollowRequests";
import { ArrowLeft, Film, Loader2, Lock, UserCheck, Clock } from "lucide-react";

interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");

  const profileQuery = useQuery({
    queryKey: ["public-profile", username],
    enabled: !!username,
    queryFn: async (): Promise<PublicProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .eq("username", username!)
        .maybeSingle();
      if (error) throw error;
      return (data as PublicProfile) ?? null;
    },
  });

  const profile = profileQuery.data;
  const { data: outgoing } = useMyOutgoingRequests(user?.id);
  const sendRequest = useSendFollowRequest(user?.id);
  const cancelRequest = useCancelFollowRequest(user?.id);

  // Public reels (RLS hides private/removed automatically)
  const reelsQuery = useQuery({
    queryKey: ["public-reels", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url, caption")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const existingRequest = useMemo(
    () => (profile?.id ? outgoing?.[profile.id] : undefined),
    [outgoing, profile?.id],
  );

  // Reset composer when target changes
  useEffect(() => {
    setComposing(false);
    setMessage("");
  }, [profile?.id]);

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 pt-10 text-center">
        <h1 className="text-xl font-bold">User not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't find <span className="font-mono">@{username}</span>.
        </p>
        <Button asChild variant="brand" className="mt-6">
          <Link to="/search">Search for users</Link>
        </Button>
      </div>
    );
  }

  const isMe = user?.id === profile.id;

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <Link
        to={-1 as unknown as string}
        onClick={(e) => {
          e.preventDefault();
          window.history.length > 1 ? window.history.back() : null;
        }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <header className="mb-6 flex flex-col items-center text-center">
        <Avatar className="h-24 w-24 border-2 border-border shadow-soft">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-gradient-brand text-2xl text-white">
            {profile.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-3 text-xl font-bold">
          {profile.display_name ?? profile.username}
        </h1>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>
        {profile.bio && (
          <p className="mt-3 max-w-xs text-sm leading-snug">{profile.bio}</p>
        )}

        {!isMe && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <FollowButton targetUserId={profile.id} />
            <FollowRequestArea
              existingStatus={existingRequest?.status}
              isComposing={composing}
              onCompose={() => setComposing(true)}
              onCancel={() =>
                profile.id && cancelRequest.mutate(profile.id)
              }
              onSubmit={() =>
                sendRequest.mutate(
                  { targetUserId: profile.id, message },
                  { onSuccess: () => setComposing(false) },
                )
              }
              message={message}
              setMessage={setMessage}
              submitting={sendRequest.isPending}
            />
          </div>
        )}
      </header>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Film className="h-4 w-4" /> Public reels ({reelsQuery.data?.length ?? 0})
      </h2>

      {reelsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !reelsQuery.data || reelsQuery.data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No public reels yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {reelsQuery.data.map((v) => (
            <Link
              key={v.id}
              to={`/?v=${v.id}`}
              className="group relative aspect-[9/16] overflow-hidden rounded-md bg-muted"
            >
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt={v.caption ?? ""}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <video
                  src={v.video_url}
                  className="h-full w-full object-cover"
                  muted
                  preload="metadata"
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface FRProps {
  existingStatus: "pending" | "accepted" | "declined" | undefined;
  isComposing: boolean;
  onCompose: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  message: string;
  setMessage: (s: string) => void;
  submitting: boolean;
}

const FollowRequestArea = ({
  existingStatus,
  isComposing,
  onCompose,
  onCancel,
  onSubmit,
  message,
  setMessage,
  submitting,
}: FRProps) => {
  if (existingStatus === "accepted") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserCheck className="h-4 w-4 text-primary" />
        Request accepted
      </div>
    );
  }
  if (existingStatus === "pending") {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> Request pending
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel request
        </Button>
      </div>
    );
  }
  if (isComposing) {
    return (
      <div className="w-full max-w-xs space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Add an optional note (e.g. why you'd like access)…"
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" variant="brand" onClick={onSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Send request
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={onCompose}>
      <Lock className="mr-1.5 h-3.5 w-3.5" />
      Request access
    </Button>
  );
};
