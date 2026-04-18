import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedVideos, FeedVideo } from "@/hooks/useVideos";
import { VideoCard } from "@/components/VideoCard";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Feed() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: videos, isLoading } = useFeedVideos(user?.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);

  // Detect which video is centered
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-video-index]"));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = Number(entry.target.getAttribute("data-video-index"));
            setActiveIndex(idx);
          }
        });
      },
      { root, threshold: [0.6] }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [videos]);

  const optimisticToggleLike = (video: FeedVideo) => {
    qc.setQueryData<FeedVideo[]>(["feed-videos", user?.id ?? "anon"], (old) => {
      if (!old) return old;
      return old.map((v) =>
        v.id === video.id
          ? {
              ...v,
              liked_by_me: !v.liked_by_me,
              likes_count: v.likes_count + (v.liked_by_me ? -1 : 1),
            }
          : v
      );
    });
  };

  const handleToggleLike = async (video: FeedVideo) => {
    if (!user) {
      toast.error("Sign in to like videos");
      return;
    }
    const wasLiked = video.liked_by_me;
    optimisticToggleLike(video);

    if (wasLiked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("video_id", video.id);
      if (error) {
        optimisticToggleLike(video); // revert
        toast.error("Couldn't unlike");
      }
    } else {
      const { error } = await supabase
        .from("likes")
        .insert({ user_id: user.id, video_id: video.id });
      if (error && !error.message.includes("duplicate")) {
        optimisticToggleLike(video); // revert
        toast.error("Couldn't like");
      }
    }
  };

  const list = useMemo(() => videos ?? [], [videos]);

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <div className="rounded-full bg-gradient-brand p-6 shadow-glow">
          <Film className="h-12 w-12 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">No reels yet</h2>
          <p className="mt-1 text-muted-foreground">Be the first to upload a video.</p>
        </div>
        <Button asChild variant="brand" size="lg">
          <Link to="/upload">Upload your first reel</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="scrollbar-hide h-[100dvh] snap-y snap-mandatory overflow-y-scroll bg-black"
      style={{ scrollBehavior: "smooth" }}
    >
      {list.map((v, i) => (
        <div key={v.id} data-video-index={i}>
          <VideoCard
            video={v}
            active={i === activeIndex}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onToggleLike={() => handleToggleLike(v)}
          />
        </div>
      ))}
    </div>
  );
}
