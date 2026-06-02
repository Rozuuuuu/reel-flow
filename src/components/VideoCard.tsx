import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Heart, Volume2, VolumeX, Play, Share2, Copy, Check, X, MessageCircle, Bookmark } from "lucide-react";
import { useGuestSaves } from "@/hooks/useGuestSaves";
import { useSavedIds, useToggleSavedVideo } from "@/hooks/useSavedVideos";
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
import { useAuthGate } from "@/hooks/useAuthGate";

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
  /** Optional comment id to focus inside the comments sheet (`?c=<id>` deep link). */
  focusCommentId?: string | null;
  /** Called when the focus action has been consumed (parent should clear ?c). */
  onFocusCommentConsumed?: () => void;
}

const VideoCardImpl = ({
  video,
  active,
  muted,
  onToggleMute,
  onToggleLike,
  focusCommentId,
  onFocusCommentConsumed,
}: Props) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { data: commentCount } = useCommentCount(video.id);
  const { requireAuth, gate, isGuest } = useAuthGate();
  const { isSaved: isGuestSaved, toggle: toggleGuestSave } = useGuestSaves();
  const { data: savedIdSet } = useSavedIds();
  const { toggle: toggleCloudSave, isPending: isSavingPending } = useToggleSavedVideo();
  const [guestSaving, setGuestSaving] = useState(false);
  const saved = isGuest ? isGuestSaved(video.id) : !!savedIdSet?.has(video.id);
  const savePending = isGuest ? guestSaving : isSavingPending(video.id);

  const handleSave = useCallback(async () => {
    if (isGuest) {
      setGuestSaving(true);
      try {
        const nowSaved = toggleGuestSave(video.id);
        toast.success(nowSaved ? "Saved on this device" : "Removed from saved", {
          description: nowSaved ? "Open Saved to view them anytime." : undefined,
          action: nowSaved
            ? {
                label: "View saved",
                onClick: () => window.location.assign("/saved"),
              }
            : undefined,
        });
        void trackEvent("guest_save_toggle", {
          props: { video_id: video.id, saved: nowSaved },
        });
      } finally {
        setGuestSaving(false);
      }
      return;
    }
    requireAuth("save reels to your library", async () => {
      const wasSaved = !!savedIdSet?.has(video.id);
      const toastId = toast.loading(wasSaved ? "Removing…" : "Saving…");
      try {
        const nowSaved = await toggleCloudSave(video.id, wasSaved);
        toast.success(nowSaved ? "Saved to your library" : "Removed from saved", {
          id: toastId,
          action: nowSaved
            ? {
                label: "View saved",
                onClick: () => window.location.assign("/saved"),
              }
            : undefined,
        });
      } catch {
        toast.error("Couldn't update saved. Try again.", { id: toastId });
      }
    });
  }, [isGuest, toggleGuestSave, video.id, requireAuth, savedIdSet, toggleCloudSave]);

  // Auto-open the comments sheet when a `?c=<id>` deep link points at this video.
  useEffect(() => {
    if (active && focusCommentId) setCommentsOpen(true);
  }, [active, focusCommentId]);

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

  const handleTap = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPaused(false)).catch(() => {});
    } else {
      el.pause();
      setPaused(true);
    }
  }, []);

  const handleDoubleTap = useCallback(() => {
    if (!video.liked_by_me) onToggleLike();
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 600);
  }, [video.liked_by_me, onToggleLike]);

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
    <section className="relative h-[100dvh] w-full snap-start snap-always bg-black md:flex md:items-center md:justify-center">
      <div className="relative mx-auto h-full w-full max-w-[min(100vw,calc(100dvh*9/16))] md:aspect-[9/16] md:h-[min(100dvh,900px)] md:w-auto md:max-w-none md:overflow-hidden md:rounded-2xl md:shadow-sog">
      <video
        ref={ref}
        src={video.video_url}
        poster={video.thumbnail_url ?? undefined}
        className="absolute inset-0 h-full w-full object-contain md:object-cover"
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
        className="absolute right-3 top-16 z-10 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/60 sm:right-4 sm:p-2 md:top-4"
        style={{ marginTop: "env(safe-area-inset-top)" }}
      >
        {muted ? (
          <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" />
        ) : (
          <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
        )}
      </button>

      {/* Right action rail — sizes scale with viewport for consistent touch targets */}
      <div className="absolute bottom-40 right-2 z-10 flex flex-col items-center gap-3 sm:bottom-44 sm:right-3 sm:gap-4 md:bottom-32 md:gap-5">
        <button
          type="button"
          onClick={() => requireAuth("like this reel", onToggleLike)}
          aria-label={video.liked_by_me ? "Unlike" : "Like"}
          className="flex flex-col items-center gap-1 text-white"
        >
          <div
            className={cn(
              "rounded-full bg-black/30 p-2 backdrop-blur-sm transition active:scale-90 sm:p-2.5 md:p-3",
              video.liked_by_me && "bg-primary/20"
            )}
          >
            <Heart
              className={cn(
                "h-5 w-5 transition sm:h-6 sm:w-6 md:h-7 md:w-7",
                video.liked_by_me ? "fill-primary text-primary" : "text-white"
              )}
            />
          </div>
          <span className="text-[11px] font-semibold drop-shadow sm:text-xs">
            {video.likes_count}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            requireAuth("join the conversation", () => {
              setCommentsOpen(true);
              void trackEvent("comment_open", { props: { video_id: video.id } });
            })
          }
          aria-label="Comments"
          className="flex flex-col items-center gap-1 text-white"
        >
          <div className="rounded-full bg-black/30 p-2 backdrop-blur-sm transition active:scale-90 sm:p-2.5 md:p-3">
            <MessageCircle className="h-5 w-5 text-white sm:h-6 sm:w-6 md:h-7 md:w-7" />
          </div>
          <span className="text-[11px] font-semibold drop-shadow sm:text-xs">
            {commentCount ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={savePending}
          aria-label={saved ? "Remove from saved" : "Save"}
          aria-pressed={saved}
          aria-busy={savePending}
          className="flex flex-col items-center gap-1 text-white disabled:opacity-60"
        >
          <div
            className={cn(
              "rounded-full bg-black/30 p-2 backdrop-blur-sm transition active:scale-90 sm:p-2.5 md:p-3",
              saved && "bg-primary/20",
              savePending && "animate-pulse",
            )}
          >
            <Bookmark
              className={cn(
                "h-5 w-5 transition sm:h-6 sm:w-6 md:h-7 md:w-7",
                saved ? "fill-primary text-primary" : "text-white",
              )}
            />
          </div>
          <span className="text-[11px] font-semibold drop-shadow sm:text-xs">
            {savePending ? "…" : saved ? "Saved" : "Save"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Share"
          className="flex flex-col items-center gap-1 text-white"
        >
          <div className="rounded-full bg-black/30 p-2 backdrop-blur-sm transition active:scale-90 sm:p-2.5 md:p-3">
            <Share2 className="h-5 w-5 text-white sm:h-6 sm:w-6 md:h-7 md:w-7" />
          </div>
          <span className="text-[11px] font-semibold drop-shadow sm:text-xs">Share</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-36 z-10 px-4 pr-20 text-white md:bottom-24">
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
      </div>

      <CommentsSheet
        videoId={video.id}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        focusCommentId={focusCommentId ?? null}
        onFocusConsumed={onFocusCommentConsumed}
      />
      {gate}
    </section>
  );
};

export const VideoCard = memo(VideoCardImpl);

