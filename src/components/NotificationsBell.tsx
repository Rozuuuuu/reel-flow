import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Loader2, BellOff, BellRing, MessageCircle } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationsRealtime,
  type AppNotification,
} from "@/hooks/useNotifications";
import {
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
} from "@/lib/webPush";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** "icon" for sidebar/bottom nav, "full" for use in standalone pages. */
  variant?: "icon" | "full";
}

export const NotificationsBell = ({ variant = "icon" }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const { data: unread = 0 } = useUnreadNotificationCount(user?.id);
  const { data: list, isLoading } = useNotifications(open ? user?.id : undefined);
  const markRead = useMarkNotificationRead(user?.id);
  const markAll = useMarkAllNotificationsRead(user?.id);
  useNotificationsRealtime(user?.id);

  useEffect(() => {
    if (!pushSupported()) {
      setPushOn(false);
      return;
    }
    void getCurrentSubscription().then((sub) => setPushOn(!!sub));
  }, [user?.id]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void trackEvent("notification_open", { props: { unread } });
    }
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.read_at) {
      try {
        await markRead.mutateAsync(n.id);
      } catch {
        /* ignore */
      }
    }
    void trackEvent("notification_click", {
      props: { type: n.type, has_video: !!n.video_id },
    });
    setOpen(false);
    if (n.video_id) {
      const c = n.comment_id ? `&c=${n.comment_id}` : "";
      navigate(`/?v=${n.video_id}${c}`);
    }
  };

  const togglePush = async () => {
    if (!user) {
      toast.error("Sign in to enable notifications");
      return;
    }
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
        toast.success("Push notifications turned off");
      } else {
        const res = await subscribeToPush(user.id);
        if (res.ok) {
          setPushOn(true);
          toast.success("You'll get push notifications for replies");
        } else if (res.reason === "denied") {
          toast.error("Browser notifications were blocked");
        } else if (res.reason === "no-vapid") {
          toast.error("Push isn't configured on the server yet");
        } else if (res.reason === "unsupported") {
          toast.error("This browser doesn't support push notifications");
        } else {
          toast.error("Couldn't enable push notifications");
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          className={cn(
            "relative inline-flex items-center justify-center rounded-lg transition-colors",
            variant === "icon"
              ? "h-10 w-10 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              : "h-10 px-3 text-sm font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          <Bell className="h-5 w-5" />
          {variant === "full" && <span className="ml-2">Notifications</span>}
          {unread > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <div className="flex items-center gap-1">
            {pushSupported() && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pushBusy}
                onClick={togglePush}
                className="h-7 px-2 text-xs"
                aria-label={pushOn ? "Disable push" : "Enable push"}
              >
                {pushBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : pushOn ? (
                  <BellRing className="h-3.5 w-3.5" />
                ) : (
                  <BellOff className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {(list?.length ?? 0) > 0 && unread > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => markAll.mutate()}
                className="h-7 px-2 text-xs"
              >
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !list || list.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            <ul>
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left text-sm transition hover:bg-accent/40",
                      !n.read_at && "bg-primary/5",
                    )}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage
                        src={n.actor?.avatar_url ?? undefined}
                        alt=""
                      />
                      <AvatarFallback className="bg-gradient-brand text-[10px] text-white">
                        {(n.actor?.username ?? "?")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-semibold">
                          @{n.actor?.username ?? "someone"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {n.type === "comment_reply"
                            ? "replied to your comment"
                            : n.type === "follow_request"
                              ? "wants to follow you"
                              : "started following you"}
                        </span>
                      </p>
                      {typeof (n.data as { preview?: unknown })?.preview ===
                        "string" && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {(n.data as { preview: string }).preview}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(n.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!n.read_at && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-3 py-2">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <MessageCircle className="h-3 w-3" />
            Manage in profile
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
};
