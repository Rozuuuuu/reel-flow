import { useEffect, useRef, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Send,
  Trash2,
  MessageCircle,
  MoreVertical,
  Pencil,
  Flag,
  Reply,
  EyeOff,
  Eye,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTopLevelComments,
  useReplies,
  useReplyCount,
  useAddComment,
  useUpdateComment,
  useDeleteComment,
  useToggleHideComment,
  useReportComment,
  useIsModerator,
  useCommentsRealtime,
  type Comment,
} from "@/hooks/useComments";
import { trackEvent } from "@/lib/analytics";

interface Props {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommentsSheet = ({ videoId, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTopLevelComments(open ? videoId : undefined);
  const { data: isModerator } = useIsModerator(open ? user?.id : undefined);
  useCommentsRealtime(open ? videoId : undefined);

  const addMutation = useAddComment(videoId);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll sentinel
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allComments = (data?.pages.flat() ?? []) as Comment[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await addMutation.mutateAsync({
        userId: user.id,
        body: trimmed,
        parentId: replyTo?.id ?? null,
      });
      setBody("");
      setReplyTo(null);
      void trackEvent("comment_create", {
        props: { video_id: videoId, is_reply: !!replyTo },
      });
    } catch {
      toast.error("Couldn't post comment");
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="mx-auto flex h-[85dvh] max-w-lg flex-col gap-0 border-border bg-card p-0 focus-visible:outline-none">
          <DrawerHeader className="border-b border-border px-4 py-3 text-left">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" />
              Comments
              {allComments.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {allComments.length}
                  {hasNextPage ? "+" : ""}
                </span>
              )}
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allComments.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <MessageCircle className="h-8 w-8" />
                <p className="text-sm">No comments yet. Be the first.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {allComments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    videoId={videoId}
                    currentUserId={user?.id ?? null}
                    isModerator={!!isModerator}
                    onReply={(parent) => {
                      setReplyTo(parent);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    onReport={(target) => setReportTarget(target)}
                  />
                ))}
                {hasNextPage && (
                  <li
                    ref={sentinelRef}
                    className="flex items-center justify-center py-4 text-xs text-muted-foreground"
                  >
                    {isFetchingNextPage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Scroll for more"
                    )}
                  </li>
                )}
              </ul>
            )}
          </div>

          {replyTo && (
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-xs">
              <span className="truncate text-muted-foreground">
                Replying to{" "}
                <span className="font-semibold text-foreground">
                  @{replyTo.profile?.username ?? "user"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Cancel reply"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form
            onSubmit={submit}
            className="flex items-center gap-2 border-t border-border bg-card px-3 py-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <Input
              ref={inputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                user
                  ? replyTo
                    ? `Reply to @${replyTo.profile?.username ?? "user"}…`
                    : "Add a comment…"
                  : "Sign in to comment"
              }
              disabled={!user || addMutation.isPending}
              maxLength={500}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              variant="brand"
              disabled={!user || !body.trim() || addMutation.isPending}
              aria-label="Post comment"
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </DrawerContent>
      </Drawer>

      <ReportDialog
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        currentUserId={user?.id ?? null}
      />
    </>
  );
};

interface CommentItemProps {
  comment: Comment;
  videoId: string;
  currentUserId: string | null;
  isModerator: boolean;
  onReply: (c: Comment) => void;
  onReport: (c: Comment) => void;
  isReply?: boolean;
}

const CommentItem = ({
  comment,
  videoId,
  currentUserId,
  isModerator,
  onReply,
  onReport,
  isReply = false,
}: CommentItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [showReplies, setShowReplies] = useState(false);

  const updateMutation = useUpdateComment(videoId);
  const deleteMutation = useDeleteComment(videoId);
  const hideMutation = useToggleHideComment(videoId);
  const { data: replyCount } = useReplyCount(comment.id);
  const { data: replies, isLoading: repliesLoading } = useReplies(
    comment.id,
    showReplies && !isReply,
  );

  const isOwn = currentUserId === comment.user_id;
  const isHidden = !!comment.hidden_at;
  const canModerate = isOwn || isModerator;

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.body) {
      setEditing(false);
      setDraft(comment.body);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: comment.id, body: trimmed });
      setEditing(false);
    } catch {
      toast.error("Couldn't update comment");
    }
  };

  return (
    <li className={isReply ? "ml-9" : undefined}>
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={comment.profile?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-gradient-brand text-xs text-white">
            {(comment.profile?.username ?? "U")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">
              @{comment.profile?.username ?? "unknown"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(new Date(comment.created_at), {
                addSuffix: true,
              })}
            </span>
            {comment.updated_at &&
              comment.updated_at !== comment.created_at && (
                <span className="text-xs text-muted-foreground">(edited)</span>
              )}
            {isHidden && (
              <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                Hidden
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-1 space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                rows={2}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(comment.body);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="brand"
                  onClick={saveEdit}
                  disabled={updateMutation.isPending || !draft.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p
              className={
                "break-words text-sm leading-snug" +
                (isHidden ? " italic text-muted-foreground" : "")
              }
            >
              {comment.body}
            </p>
          )}

          {!editing && (
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              {!isReply && (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="flex items-center gap-1 transition hover:text-foreground"
                >
                  <Reply className="h-3 w-3" />
                  Reply
                </button>
              )}
              {!isReply && (replyCount ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setShowReplies((v) => !v)}
                  className="font-semibold transition hover:text-foreground"
                >
                  {showReplies ? "Hide" : "View"} {replyCount}{" "}
                  {(replyCount ?? 0) === 1 ? "reply" : "replies"}
                </button>
              )}
            </div>
          )}

          {showReplies && !isReply && (
            <ul className="mt-3 space-y-3">
              {repliesLoading && (
                <li className="text-xs text-muted-foreground">Loading…</li>
              )}
              {(replies ?? []).map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  videoId={videoId}
                  currentUserId={currentUserId}
                  isModerator={isModerator}
                  onReply={onReply}
                  onReport={onReport}
                  isReply
                />
              ))}
            </ul>
          )}
        </div>

        {!editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Comment actions"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isOwn && (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
              )}
              {currentUserId && !isOwn && (
                <DropdownMenuItem onSelect={() => onReport(comment)}>
                  <Flag className="mr-2 h-4 w-4" /> Report
                </DropdownMenuItem>
              )}
              {isModerator && (
                <DropdownMenuItem
                  onSelect={() =>
                    hideMutation.mutate({ id: comment.id, hide: !isHidden })
                  }
                >
                  {isHidden ? (
                    <>
                      <Eye className="mr-2 h-4 w-4" /> Unhide
                    </>
                  ) : (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" /> Hide
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {canModerate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() =>
                      deleteMutation.mutate({
                        id: comment.id,
                        parentId: comment.parent_id,
                      })
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
};

interface ReportDialogProps {
  target: Comment | null;
  currentUserId: string | null;
  onClose: () => void;
}

const ReportDialog = ({ target, currentUserId, onClose }: ReportDialogProps) => {
  const [reason, setReason] = useState("");
  const reportMutation = useReportComment();

  useEffect(() => {
    if (!target) setReason("");
  }, [target]);

  const submit = async () => {
    if (!target || !currentUserId) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Please describe the issue");
      return;
    }
    try {
      await reportMutation.mutateAsync({
        commentId: target.id,
        reporterId: currentUserId,
        reason: trimmed,
      });
      toast.success("Report submitted. Thanks for the heads up.");
      onClose();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("duplicate")) {
        toast.info("You've already reported this comment");
        onClose();
      } else {
        toast.error("Couldn't submit report");
      }
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Report comment</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tell our moderators what's wrong with this comment.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="e.g. Hate speech, spam, harassment…"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            onClick={submit}
            disabled={!reason.trim() || reportMutation.isPending}
          >
            {reportMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Flag className="mr-1 h-4 w-4" /> Submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
