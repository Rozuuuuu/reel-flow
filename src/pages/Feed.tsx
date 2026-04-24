import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedVideos, useVideoById, FeedVideo } from "@/hooks/useVideos";
import { useMyFollowingIds } from "@/hooks/useFollows";
import { VideoCard } from "@/components/VideoCard";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Film, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DeepLinkBanner } from "@/components/DeepLinkBanner";

type FeedTab = "for-you" | "following";

export default function Feed() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkVideoId = searchParams.get("v");
  const deepLinkCommentId = searchParams.get("c");
  const { data: videos, isLoading } = useFeedVideos(user?.id);
  const { data: followingIds } = useMyFollowingIds(user?.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  // When arriving via ?v=, default to "for-you" so the target video is guaranteed in view
  const [tab, setTab] = useState<FeedTab>(deepLinkVideoId ? "for-you" : "for-you");

  // If the deep-linked video isn't in the base feed, fetch it separately
  const baseList = videos ?? [];
  const baseHasDeepLink = deepLinkVideoId
    ? baseList.some((v) => v.id === deepLinkVideoId)
    : true;
  const fallbackQuery = useVideoById(
    !baseHasDeepLink ? deepLinkVideoId ?? undefined : undefined,
    user?.id
  );
  const fallbackVideo = fallbackQuery.data?.video ?? null;
  const fallbackStatus = fallbackQuery.data?.status;

  const list = useMemo(() => {
    let base = baseList;
    // Prepend the fallback-fetched video so it exists in the scroll list
    if (
      deepLinkVideoId &&
      !baseHasDeepLink &&
      fallbackVideo &&
      !base.some((v) => v.id === fallbackVideo.id)
    ) {
      base = [fallbackVideo, ...base];
    }
    if (tab === "following") {
      const ids = new Set(followingIds ?? []);
      return base.filter((v) => ids.has(v.user_id));
    }
    return base;
  }, [baseList, tab, followingIds, deepLinkVideoId, baseHasDeepLink, fallbackVideo]);

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
  }, [list]);

  // Reset index when switching tabs
  useEffect(() => {
    setActiveIndex(0);
    containerRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  // Deep-link: scroll to ?v=<id> once the target is in the list, then clear the param
  useEffect(() => {
    if (!deepLinkVideoId || list.length === 0) return;
    const idx = list.findIndex((v) => v.id === deepLinkVideoId);
    if (idx < 0) return;
    const root = containerRef.current;
    if (!root) return;
    requestAnimationFrame(() => {
      const target = root.querySelector<HTMLElement>(`[data-video-index="${idx}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        setActiveIndex(idx);
      }
      const next = new URLSearchParams(searchParams);
      next.delete("v");
      setSearchParams(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkVideoId, list]);

  // Deep-link missing from the "following" tab → switch to For You so it shows up
  useEffect(() => {
    if (!deepLinkVideoId) return;
    if (tab !== "following") return;
    const inList = list.some((v) => v.id === deepLinkVideoId);
    const inBase = (videos ?? []).some((v) => v.id === deepLinkVideoId);
    const inFallback = fallbackVideo?.id === deepLinkVideoId;
    if (!inList && (inBase || inFallback)) {
      setTab("for-you");
    }
  }, [deepLinkVideoId, tab, list, videos, fallbackQuery.data]);

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
        optimisticToggleLike(video);
        toast.error("Couldn't unlike");
      }
    } else {
      const { error } = await supabase
        .from("likes")
        .insert({ user_id: user.id, video_id: video.id });
      if (error && !error.message.includes("duplicate")) {
        optimisticToggleLike(video);
        toast.error("Couldn't like");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs = (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      <div
        role="tablist"
        aria-label="Feed type"
        className="pointer-events-auto flex items-center gap-6 rounded-full px-4 py-2 text-sm font-semibold text-white/70"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <button
          role="tab"
          aria-selected={tab === "following"}
          onClick={() => setTab("following")}
          className={cn(
            "transition drop-shadow",
            tab === "following" ? "text-white" : "hover:text-white/90"
          )}
        >
          Following
          {tab === "following" && <span className="mx-auto mt-1 block h-0.5 w-5 rounded-full bg-white" />}
        </button>
        <button
          role="tab"
          aria-selected={tab === "for-you"}
          onClick={() => setTab("for-you")}
          className={cn(
            "transition drop-shadow",
            tab === "for-you" ? "text-white" : "hover:text-white/90"
          )}
        >
          For You
          {tab === "for-you" && <span className="mx-auto mt-1 block h-0.5 w-5 rounded-full bg-white" />}
        </button>
      </div>
    </div>
  );

  if (list.length === 0) {
    const isFollowingEmpty = tab === "following";
    return (
      <div className="relative h-[100dvh] bg-black">
        {tabs}
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="rounded-full bg-gradient-brand p-6 shadow-glow">
            {isFollowingEmpty ? (
              <UserPlus className="h-12 w-12 text-white" />
            ) : (
              <Film className="h-12 w-12 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {isFollowingEmpty ? "Nothing here yet" : "No reels yet"}
            </h2>
            <p className="mt-1 text-white/70">
              {isFollowingEmpty
                ? "Follow creators to see their reels here."
                : "Be the first to upload a video."}
            </p>
          </div>
          <Button asChild variant="brand" size="lg">
            <Link to={isFollowingEmpty ? "/search" : "/upload"}>
              {isFollowingEmpty ? "Find people to follow" : "Upload your first reel"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Deep-link fallback UX state
  const deepLinkActive = !!deepLinkVideoId && !baseHasDeepLink;
  const deepLinkFetching = deepLinkActive && fallbackQuery.isLoading;
  const deepLinkErrored = deepLinkActive && fallbackQuery.isError;
  const fallbackCreator = fallbackQuery.data?.creator ?? null;
  // Distinct states once the lookup resolves with no playable video
  const deepLinkState: "private" | "removed" | "not_found" | null =
    deepLinkActive && !fallbackVideo && !fallbackQuery.isLoading
      ? deepLinkErrored
        ? "not_found"
        : fallbackStatus === "private"
          ? "private"
          : fallbackStatus === "removed"
            ? "removed"
            : "not_found"
      : null;

  const clearDeepLink = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("v");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="relative h-[100dvh] bg-black">
      {tabs}

      {deepLinkFetching && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shared reel…
          </div>
        </div>
      )}

      {deepLinkState && deepLinkVideoId && (
        <DeepLinkBanner
          state={deepLinkState}
          videoId={deepLinkVideoId}
          errored={deepLinkErrored}
          retrying={fallbackQuery.isFetching}
          creator={fallbackCreator}
          onRetry={() => fallbackQuery.refetch()}
          onDismiss={clearDeepLink}
        />
      )}


      <div
        ref={containerRef}
        className="scrollbar-hide h-full snap-y snap-mandatory overflow-y-scroll"
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
              focusCommentId={
                deepLinkCommentId && v.id === deepLinkVideoId
                  ? deepLinkCommentId
                  : null
              }
              onFocusCommentConsumed={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("c");
                setSearchParams(next, { replace: true });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
