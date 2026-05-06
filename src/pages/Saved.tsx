import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Loader2,
  Play,
  Trash2,
  Cloud,
  Share2,
  Check,
  Copy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGuestSaves } from "@/hooks/useGuestSaves";
import { useVideosByIds } from "@/hooks/useVideos";
import {
  useSavedVideoIdsInfinite,
  useToggleSavedVideo,
} from "@/hooks/useSavedVideos";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

/**
 * Saved reels page.
 *  - Guests: localStorage list with sign-in CTA.
 *  - Signed-in: paginated cloud library via `useSavedVideoIdsInfinite`.
 */
export default function Saved() {
  const { user } = useAuth();
  const isGuest = !user;

  return (
    <div className="min-h-[100dvh] bg-background pb-24 pt-2">
      <header
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Bookmark className="h-5 w-5 text-primary" />
        <h1 className="text-base font-semibold sm:text-lg">Saved</h1>
      </header>

      {isGuest ? <GuestSaved /> : <CloudSaved />}
    </div>
  );
}

/* -------------------------- Guest (localStorage) -------------------------- */

function GuestSaved() {
  const { user } = useAuth();
  const { ids, clear, toggle } = useGuestSaves();
  const { data: videos, isLoading } = useVideosByIds(ids, user?.id);

  return (
    <>
      <section className="mx-auto mt-4 w-full max-w-3xl px-4">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-sm font-semibold">
            These saves live on this device only
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in to keep your saved reels across devices and never lose them
            when you clear your browser.
          </p>
          <Button asChild size="sm" variant="brand" className="mt-3">
            <Link to="/auth">Sign in to save permanently</Link>
          </Button>
        </div>
      </section>

      <SavedToolbar ids={ids} count={ids.length} />

      <section className="mx-auto mt-3 w-full max-w-5xl px-3 sm:px-4">
        {ids.length === 0 ? (
          <EmptyState />
        ) : isLoading ? (
          <LoadingState />
        ) : (
          <SavedGrid
            videos={videos ?? []}
            onRemove={(id) => {
              toggle(id);
              toast.success("Removed from saved");
            }}
          />
        )}

        {ids.length > 0 && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clear();
                toast.success("Cleared all saved reels");
              }}
              className="text-muted-foreground"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear all
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------ Signed-in -------------------------------- */

function CloudSaved() {
  const { user } = useAuth();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useSavedVideoIdsInfinite();
  const { toggle: toggleCloudSave, isPending } = useToggleSavedVideo();

  const allIds = useMemo(
    () => (data?.pages.flatMap((p) => p.ids) ?? []) as string[],
    [data],
  );
  const { data: videos, isLoading: videosLoading } = useVideosByIds(
    allIds,
    user?.id,
  );

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const empty = !isLoading && allIds.length === 0;

  return (
    <>
      <section className="mx-auto mt-4 w-full max-w-3xl px-4">
        <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Cloud className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Your saved library</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Synced across all your devices. Tap the bookmark on any reel to
                save it here.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SavedToolbar ids={allIds} count={allIds.length} />

      <section className="mx-auto mt-3 w-full max-w-5xl px-3 sm:px-4">
        {isLoading || (videosLoading && allIds.length > 0 && !videos) ? (
          <LoadingState />
        ) : empty ? (
          <EmptyState />
        ) : (
          <>
            <SavedGrid
              videos={videos ?? []}
              onRemove={async (id) => {
                const tId = toast.loading("Removing…");
                try {
                  await toggleCloudSave(id, true);
                  toast.success("Removed from saved", { id: tId });
                } catch {
                  toast.error("Couldn't remove. Try again.", { id: tId });
                }
              }}
              isRemoving={(id) => isPending(id)}
            />
            <div ref={sentinelRef} className="h-10" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasNextPage && allIds.length > 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                You're all caught up.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

/* --------------------------------- UI bits -------------------------------- */

function SavedToolbar({ ids, count }: { ids: string[]; count: number }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (ids.length === 0) {
      toast.info("Nothing to share yet");
      return;
    }
    const url = `${window.location.origin}/saved?ids=${encodeURIComponent(
      ids.join(","),
    )}`;
    const shareData = {
      title: "My saved reels",
      text: `Check out my ${ids.length} saved reel${ids.length === 1 ? "" : "s"}`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Share link copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  return (
    <div className="mx-auto mt-3 flex w-full max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
      <span className="text-xs text-muted-foreground">
        {count} item{count === 1 ? "" : "s"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleShare}
        disabled={count === 0}
      >
        {copied ? (
          <>
            <Check className="mr-1.5 h-4 w-4" />
            Copied
          </>
        ) : (
          <>
            <Share2 className="mr-1.5 h-4 w-4" />
            Share saved
          </>
        )}
      </Button>
    </div>
  );
}

function SavedGrid({
  videos,
  onRemove,
  isRemoving,
}: {
  videos: { id: string; thumbnail_url: string | null; caption: string | null; profile: { username: string } | null }[];
  onRemove: (id: string) => void;
  isRemoving?: (id: string) => boolean;
}) {
  return (
    <ul
      className="grid gap-2 sm:gap-3
                 grid-cols-2
                 sm:grid-cols-3
                 md:grid-cols-4
                 lg:grid-cols-5
                 xl:grid-cols-6"
    >
      {videos.map((v) => {
        const removing = isRemoving?.(v.id) ?? false;
        return (
          <li
            key={v.id}
            className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-muted"
          >
            <Link
              to={`/?v=${v.id}`}
              className="block h-full w-full"
              aria-label={`Play reel by @${v.profile?.username ?? "unknown"}`}
            >
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt={v.caption ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-background">
                  <Play className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 sm:p-2">
                <p className="truncate text-[11px] font-medium text-white sm:text-xs">
                  @{v.profile?.username ?? "unknown"}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => !removing && onRemove(v.id)}
              disabled={removing}
              aria-label="Remove from saved"
              aria-busy={removing}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white transition
                         opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                         focus-visible:opacity-100 disabled:opacity-50
                         min-h-[32px] min-w-[32px] flex items-center justify-center"
            >
              {removing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-muted p-4">
        <Bookmark className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No saved reels yet</h3>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tap the bookmark on any reel to save it here for later.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link to="/">Browse reels</Link>
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
