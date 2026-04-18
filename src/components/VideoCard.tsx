import { useEffect, useRef, useState } from "react";
import { Heart, Volume2, VolumeX, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedVideo } from "@/hooks/useVideos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-6 z-10 px-4 pr-20 text-white">
        <div className="mb-3 flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-white/80">
            <AvatarImage src={video.profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-gradient-brand text-white">
              {(video.profile?.username ?? "U")[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="font-semibold drop-shadow">
            @{video.profile?.username ?? "unknown"}
          </div>
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
    </section>
  );
};
