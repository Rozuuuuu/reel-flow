import { Link } from "react-router-dom";
import { Bookmark, Loader2, Play, Trash2, Cloud } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGuestSaves } from "@/hooks/useGuestSaves";
import { useVideosByIds } from "@/hooks/useVideos";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Saved reels.
 *  - Guests: shows the local (device-only) list from `useGuestSaves` with a
 *    persistent "Sign in to save across devices" CTA.
 *  - Signed-in users: their persistent library is not yet implemented, so we
 *    show a friendly "coming soon" panel. Any locally-saved guest items are
 *    surfaced below it as a one-time migration helper.
 */
export default function Saved() {
  const { user } = useAuth();
  const { ids, clear, toggle } = useGuestSaves();
  const { data: videos, isLoading } = useVideosByIds(ids, user?.id);

  const isGuest = !user;

  return (
    <div className="min-h-[100dvh] bg-background pb-24 pt-4">
      <header
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Bookmark className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Saved</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          {ids.length} item{ids.length === 1 ? "" : "s"}
        </span>
      </header>

      {!isGuest && (
        <section className="mx-auto mt-4 max-w-xl px-4">
          <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Cloud className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold">
                  Your cloud library is coming soon
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  We're building a permanent saved library for your account.
                  Anything saved on this device is shown below for now.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {isGuest && (
        <section className="mx-auto mt-4 max-w-xl px-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h2 className="text-sm font-semibold">
              These saves live on this device only
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in to keep your saved reels across devices and never lose
              them when you clear your browser.
            </p>
            <Button asChild size="sm" variant="brand" className="mt-3">
              <Link to="/auth">Sign in to save permanently</Link>
            </Button>
          </div>
        </section>
      )}

      {/* List */}
      <section className="mx-auto mt-4 max-w-xl px-4">
        {ids.length === 0 ? (
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
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(videos ?? []).map((v) => (
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="truncate text-xs font-medium text-white">
                        @{v.profile?.username ?? "unknown"}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      toggle(v.id);
                      toast.success("Removed from saved");
                    }}
                    aria-label="Remove from saved"
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>

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
          </>
        )}
      </section>
    </div>
  );
}
