import { useEffect, useRef, useState } from "react";
import { Heart, Volume2, VolumeX, Play, Share2, Copy, Check, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedVideo } from "@/hooks/useVideos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton } from "@/components/FollowButton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildShareUrl } from "@/lib/shareUrl";
import { trackEvent } from "@/lib/analytics";
import { CommentsSheet } from "@/components/CommentsSheet";
import { useCommentCount } from "@/hooks/useComments";

const makeShareUrl = (videoId: string) =>
  buildShareUrl({
    videoId,
    origin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  });

interface Props {
  video: FeedVideo;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onToggleLike: () => void;
}

export const VideoCard = ({ video, active, muted, onToggleMute, onToggleLike }: Props) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { data: commentCount } = useCommentCount(video.id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.currentTime = 0;
      el.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      el.pause();
    }
  }, [active]);

  const handleTap = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPaused(false)).catch(() => {});
    } else {
      el.pause();
      setPaused(true);
    }
  };

  const handleDoubleTap = () => {
    if (!video.liked_by_me) onToggleLike();
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 600);
  };

  const handleShare = async () => {
    const { shareUrl, usesEdgeFunction } = makeShareUrl(video.id);
    void trackEvent("share_open", {
      props: { video_id: video.id, uses_edge_function: usesEdgeFunction },
    });
    const shareData = {
      title: video.profile?.username
        ? `@${video.profile.username} on Reelo`
        : "Check out this reel",
      text: video.caption ?? "Check out this reel",
      url: shareUrl,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        void trackEvent("share_native_success", {
          props: { video_id: video.id },
        });
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        void trackEvent("share_native_aborted", {
          props: { video_id: video.id },
        });
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard");
      void trackEvent("share_copy_success", {
        props: { video_id: video.id, surface: "auto" },
      });
      return;
    } catch {
      // Clipboard blocked (permissions, insecure context, iframe, etc.)
      // Surface a manual fallback panel with the link + a Copy button.
      setCopied(false);
      setShareFallback(shareUrl);
      void trackEvent("share_fallback_open", {
        props: { video_id: video.id },
      });
    }
  };

  const copyFromFallback = async () => {
    if (!shareFallback) return;
    try {
      await navigator.clipboard.writeText(shareFallback);
      setCopied(true);
      toast.success("Link copied");
      void trackEvent("share_fallback_copy_success", {
        props: { video_id: video.id },
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Final fallback: select the input text so the user can copy manually
      const input = document.getElementById(
        `share-fallback-${video.id}`,
      ) as HTMLInputElement | null;
      input?.select();
      toast.error("Couldn't copy automatically — text is selected, press ⌘/Ctrl+C");
      void trackEvent("share_fallback_copy_failed", {
        props: { video_id: video.id },
      });
    }
  };

  return (
    <section className="relative h-[100dvh] w-full snap-start snap-always bg-black">
      <video
        ref={ref}
        src={video.video_url}
        poster={video.thumbnail_url ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        playsInline
        muted={muted}
        onClick={handleTap}
        onDoubleClick={handleDoubleTap}
        preload="metadata"
      />

      {/* Top gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 overlay-top" />
      {/* Bottom gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 overlay-bottom" />

      {/* Pause indicator */}
      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/40 p-6 backdrop-blur-sm">
            <Play className="h-12 w-12 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Double-tap heart */}
      {showHeart && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Heart className="h-32 w-32 animate-heart-pop fill-primary text-primary drop-shadow-[0_0_24px_hsl(var(--primary))]" />
        </div>
      )}

      {/* Mute toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-4 top-4 z-10 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {/* Right action rail */}
      <div className="absolute bottom-32 right-3 z-10 flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={onToggleLike}
          aria-label={video.liked_by_me ? "Unlike" : "Like"}
          className="flex flex-col items-center gap-1 text-white"
        >
          <div
            className={cn(
              "rounded-full bg-black/30 p-3 backdrop-blur-sm transition active:scale-90",
              video.liked_by_me && "bg-primary/20"
            )}
          >
            <Heart
              className={cn(
                "h-7 w-7 transition",
                video.liked_by_me ? "fill-primary text-primary" : "text-white"
              )}
            />
          </div>
          <span className="text-xs font-semibold drop-shadow">
            {video.likes_count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCommentsOpen(true);
            void trackEvent("comment_open", { props: { video_id: video.id } });
          }}
          aria-label="Comments"
          className="flex flex-col items-center gap-1 text-white"
        >
          <div className="rounded-full bg-black/30 p-3 backdrop-blur-sm transition active:scale-90">
            <MessageCircle className="h-7 w-7 text-white" />
          </div>
          <span className="text-xs font-semibold drop-shadow">
            {commentCount ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Share"
          className="flex flex-col items-center gap-1 text-white"
        >
          <div className="rounded-full bg-black/30 p-3 backdrop-blur-sm transition active:scale-90">
            <Share2 className="h-7 w-7 text-white" />
          </div>
          <span className="text-xs font-semibold drop-shadow">Share</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-24 z-10 px-4 pr-20 text-white">
        <div className="mb-3 flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-white/80">
            <AvatarImage src={video.profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-gradient-brand text-white">
              {(video.profile?.username ?? "U")[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 font-semibold drop-shadow">
            @{video.profile?.username ?? "unknown"}
          </div>
          <FollowButton targetUserId={video.user_id} />
        </div>
        {video.caption && (
          <p className="line-clamp-3 text-sm leading-snug drop-shadow">
            {video.caption}
          </p>
        )}
        {video.hashtags.length > 0 && (
          <p className="mt-1 text-sm font-medium text-white/90 drop-shadow">
            {video.hashtags.map((t) => `#${t}`).join(" ")}
          </p>
        )}
      </div>

      {/* Share fallback panel — shown only when navigator.share AND clipboard both fail */}
      {shareFallback && (
        <div
          role="dialog"
          aria-label="Copy share link"
          className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setShareFallback(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-2xl bg-card p-4 text-card-foreground shadow-glow sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Copy share link</h2>
              <button
                type="button"
                onClick={() => setShareFallback(null)}
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Your browser blocked automatic copying. Tap the button or copy the link manually.
            </p>
            <div className="flex items-center gap-2">
              <input
                id={`share-fallback-${video.id}`}
                readOnly
                value={shareFallback}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant={copied ? "secondary" : "brand"}
                onClick={copyFromFallback}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-4 w-4" />
                    Copy link
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <CommentsSheet
        videoId={video.id}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />
    </section>
  );
};
