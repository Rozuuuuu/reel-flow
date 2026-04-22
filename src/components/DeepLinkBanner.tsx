import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  HelpCircle,
  Loader2,
  Lock,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMyOutgoingRequests,
  useSendFollowRequest,
} from "@/hooks/useFollowRequests";
import type { CreatorRef, VideoStatus } from "@/hooks/useVideos";
import { trackEvent } from "@/lib/analytics";

export type DeepLinkResolved = "private" | "removed" | "not_found";

interface Props {
  state: DeepLinkResolved;
  videoId: string;
  errored: boolean;
  retrying: boolean;
  creator: CreatorRef | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export const DeepLinkBanner = ({
  state,
  videoId,
  errored,
  retrying,
  creator,
  onRetry,
  onDismiss,
}: Props) => {
  const { user } = useAuth();
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const { data: outgoing } = useMyOutgoingRequests(user?.id);
  const sendRequest = useSendFollowRequest(user?.id);

  const existingRequest = creator?.id ? outgoing?.[creator.id] : undefined;

  // Fire a one-time analytics event for the resolved state
  useEffect(() => {
    void trackEvent("deep_link_state_shown", {
      props: { video_id: videoId, state, has_creator: !!creator },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, videoId]);

  const Icon =
    state === "private" ? Lock : state === "removed" ? Trash2 : AlertCircle;
  const title =
    state === "private"
      ? "This reel is private"
      : state === "removed"
        ? "This reel was removed"
        : errored
          ? "Couldn't load this reel"
          : "Reel not found";
  const body =
    state === "private"
      ? creator?.username
        ? `Only @${creator.username}'s approved followers can view this reel.`
        : "The creator has set this reel to private."
      : state === "removed"
        ? "The creator deleted this reel. It's no longer available."
        : errored
          ? "We couldn't reach the server. Check your connection and try again."
          : "This shared reel couldn't be found. The link may be wrong or the reel was removed.";

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-4">
        <div
          role="alert"
          className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl bg-black/70 px-4 py-3 text-sm text-white shadow-glow backdrop-blur-sm"
        >
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{title}</p>
            <p className="mt-0.5 text-white/70">{body}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {state === "private" && creator && (
                <>
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={() =>
                      sendRequest.mutate({ targetUserId: creator.id })
                    }
                    disabled={
                      !user ||
                      sendRequest.isPending ||
                      existingRequest?.status === "pending" ||
                      existingRequest?.status === "accepted"
                    }
                  >
                    {sendRequest.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Sending…
                      </>
                    ) : existingRequest?.status === "pending" ? (
                      "Request pending"
                    ) : existingRequest?.status === "accepted" ? (
                      "Access granted"
                    ) : (
                      <>
                        <UserPlus className="mr-1 h-3 w-3" />
                        Request access
                      </>
                    )}
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/u/${creator.username}`}>View profile</Link>
                  </Button>
                </>
              )}

              {state === "private" && !creator && (
                <Button asChild size="sm" variant="secondary">
                  <Link to="/search">Find creators</Link>
                </Button>
              )}

              {state === "removed" && (
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => setLearnMoreOpen(true)}
                >
                  <HelpCircle className="mr-1 h-3 w-3" />
                  Learn more
                </Button>
              )}

              {state === "not_found" && (
                <Button
                  size="sm"
                  variant="brand"
                  onClick={onRetry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Retrying…
                    </>
                  ) : (
                    "Try again"
                  )}
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Go to feed
              </Button>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-white/60 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Dialog open={learnMoreOpen} onOpenChange={setLearnMoreOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-primary" />
              About removed reels
            </DialogTitle>
            <DialogDescription>
              When a creator deletes a reel, the video and its share link stop
              working immediately for everyone — including people who already
              have the link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">
                Why doesn't this link work?
              </span>{" "}
              The creator chose to remove this reel. Old shares can't be
              restored from outside the app.
            </p>
            <p>
              <span className="font-semibold text-foreground">
                What can I do?
              </span>{" "}
              Browse other reels in the feed, or check the creator's profile for
              their latest content.
            </p>
            <p>
              <span className="font-semibold text-foreground">
                Reporting issues:
              </span>{" "}
              If you think this was a mistake, reach out to the creator directly
              from their profile.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="secondary" onClick={() => setLearnMoreOpen(false)}>
              Close
            </Button>
            <Button variant="brand" asChild>
              <Link to="/search" onClick={() => setLearnMoreOpen(false)}>
                Discover reels
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
