import { useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  History,
  Link2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
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
  useCommentEdits,
  useCommentById,
  type Comment,
} from "@/hooks/useComments";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface Props {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional comment to scroll to + highlight (used for `?c=<id>` deep links). */
  focusCommentId?: string | null;
  /** Called once the focus action has been consumed so the parent can clear ?c. */
  onFocusConsumed?: () => void;
}

export const CommentsSheet = ({
  videoId,
  open,
  onOpenChange,
  focusCommentId,
  onFocusConsumed,
}: Props) => {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<string[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTopLevelComments(open ? videoId : undefined);
  const { data: isModerator } = useIsModerator(open ? user?.id : undefined);
  useCommentsRealtime(open ? videoId : undefined);

  // Resolve the focused comment so we know whether it's a reply (need to expand its thread).
  const { data: focusedComment } = useCommentById(open ? focusCommentId : undefined);

  const addMutation = useAddComment(videoId);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const focusConsumedRef = useRef(false);

  // Reset transient state when the sheet closes
  useEffect(() => {
    if (!open) {
      setReplyTo(null);
      setExpandedThreads([]);
      setHighlightedId(null);
      focusConsumedRef.current = false;
    }
  }, [open]);

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

  const allComments = useMemo(
    () => (data?.pages.flat() ?? []) as Comment[],
    [data],
  );

  // Deep-link to a specific comment: keep loading more pages until found,
  // then expand its thread (if it's a reply) and scroll/highlight.
  useEffect(() => {
    if (!open || !focusCommentId || focusConsumedRef.current) return;
    if (!focusedComment && !hasNextPage) {
      // Not found in this video at all — give up silently.
      focusConsumedRef.current = true;
      onFocusConsumed?.();
      return;
    }
    if (!focusedComment) return;

    const parentId = focusedComment.parent_id;
    const targetTopLevelId = parentId ?? focusedComment.id;
    const inLoadedTop = allComments.some((c) => c.id === targetTopLevelId);

    if (!inLoadedTop) {
      // Keep paginating until the relevant thread is loaded.
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      return;
    }

    focusConsumedRef.current = true;
    if (parentId) {
      setExpandedThreads((curr) =>
        curr.includes(parentId) ? curr : [...curr, parentId],
      );
    }
    setHighlightedId(focusedComment.id);
    requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${focusedComment.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    void trackEvent("comment_deep_link", {
      props: { video_id: videoId, comment_id: focusedComment.id },
    });
    setTimeout(() => setHighlightedId(null), 2400);
    onFocusConsumed?.();
  }, [
    open,
    focusCommentId,
    focusedComment,
    allComments,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    videoId,
    onFocusConsumed,
  ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      // Replies on replies should still be threaded under the original top-level parent.
      const parentId = replyTo
        ? replyTo.parent_id ?? replyTo.id
        : null;
      await addMutation.mutateAsync({
        userId: user.id,
        body: trimmed,
        parentId,
      });
      setBody("");
      setReplyTo(null);
      // Make sure the new reply is visible
      if (parentId) {
        setExpandedThreads((curr) =>
          curr.includes(parentId) ? curr : [...curr, parentId],
        );
      }
      void trackEvent("comment_create", {
        props: { video_id: videoId, is_reply: !!parentId },
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
              <Accordion
                type="multiple"
                value={expandedThreads}
                onValueChange={setExpandedThreads}
                className="space-y-1"
              >
                <ul className="space-y-3">
                  {allComments.map((c) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      videoId={videoId}
                      currentUserId={user?.id ?? null}
                      isModerator={!!isModerator}
                      highlightedId={highlightedId}
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
              </Accordion>
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
  highlightedId: string | null;
  onReply: (c: Comment) => void;
  onReport: (c: Comment) => void;
  isReply?: boolean;
}

const CommentItem = ({
  comment,
  videoId,
  currentUserId,
  isModerator,
  highlightedId,
  onReply,
  onReport,
  isReply = false,
}: CommentItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [showHistory, setShowHistory] = useState(false);

  const updateMutation = useUpdateComment(videoId);
  const deleteMutation = useDeleteComment(videoId);
  const hideMutation = useToggleHideComment(videoId);
  const { data: replyCount } = useReplyCount(comment.id);

  const isOwn = currentUserId === comment.user_id;
  const isHidden = !!comment.hidden_at;
  const canModerate = isOwn || isModerator;
  const isEdited =
    !!comment.updated_at && comment.updated_at !== comment.created_at;
  const isHighlighted = highlightedId === comment.id;

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.body) {
      setEditing(false);
      setDraft(comment.body);
      return;
    }
    if (!currentUserId) return;
    try {
      await updateMutation.mutateAsync({
        id: comment.id,
        body: trimmed,
        previousBody: comment.body,
        editorId: currentUserId,
      });
      setEditing(false);
      void trackEvent("comment_edit", {
        props: { video_id: videoId, comment_id: comment.id },
      });
    } catch {
      toast.error("Couldn't update comment");
    }
  };

  const copyDeepLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("v", comment.video_id);
      url.searchParams.set("c", comment.id);
      await navigator.clipboard.writeText(url.toString());
      toast.success("Comment link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const itemContent = (
    <div
      id={`comment-${comment.id}`}
      className={cn(
        "flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors",
        isHighlighted && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={comment.profile?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-gradient-brand text-xs text-white">
          {(comment.profile?.username ?? "U")[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold">
            @{comment.profile?.username ?? "unknown"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNowStrict(new Date(comment.created_at), {
              addSuffix: true,
            })}
          </span>
          {isEdited && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setShowHistory((v) => !v);
                    if (!showHistory) {
                      void trackEvent("comment_history_view", {
                        props: { comment_id: comment.id },
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition hover:text-foreground"
                  aria-label="Show edit history"
                >
                  <History className="h-3 w-3" />
                  edited
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Last edited{" "}
                {format(new Date(comment.updated_at), "MMM d, yyyy 'at' h:mm a")}
              </TooltipContent>
            </Tooltip>
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
            className={cn(
              "break-words text-sm leading-snug",
              isHidden && "italic text-muted-foreground",
            )}
          >
            {comment.body}
          </p>
        )}

        {showHistory && !editing && (
          <EditHistory commentId={comment.id} />
        )}

        {!editing && (
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="flex items-center gap-1 transition hover:text-foreground"
            >
              <Reply className="h-3 w-3" />
              {isReply ? "Reply under this" : "Reply"}
            </button>
            <button
              type="button"
              onClick={copyDeepLink}
              className="flex items-center gap-1 transition hover:text-foreground"
              aria-label="Copy link to comment"
            >
              <Link2 className="h-3 w-3" />
              Link
            </button>
          </div>
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
                onSelect={() => {
                  hideMutation.mutate({ id: comment.id, hide: !isHidden });
                  void trackEvent("comment_hide", {
                    props: { comment_id: comment.id, hide: !isHidden },
                  });
                }}
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
  );

  // Replies (nested, under an accordion item attached to the top-level comment).
  return (
    <li className={isReply ? "ml-9" : undefined}>
      {itemContent}

      {!isReply && (replyCount ?? 0) > 0 && (
        <AccordionItem value={comment.id} className="border-b-0">
          <AccordionTrigger className="ml-12 py-1.5 text-xs font-semibold text-muted-foreground hover:no-underline hover:text-foreground [&>svg]:hidden">
            <span className="inline-flex items-center gap-1">
              <ChevronDown className="h-3 w-3 transition-transform data-[state=open]:rotate-180" />
              View {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <RepliesList
              parentId={comment.id}
              videoId={videoId}
              currentUserId={currentUserId}
              isModerator={isModerator}
              highlightedId={highlightedId}
              onReply={onReply}
              onReport={onReport}
            />
          </AccordionContent>
        </AccordionItem>
      )}
    </li>
  );
};

interface RepliesListProps {
  parentId: string;
  videoId: string;
  currentUserId: string | null;
  isModerator: boolean;
  highlightedId: string | null;
  onReply: (c: Comment) => void;
  onReport: (c: Comment) => void;
}

const RepliesList = ({
  parentId,
  videoId,
  currentUserId,
  isModerator,
  highlightedId,
  onReply,
  onReport,
}: RepliesListProps) => {
  const { data: replies, isLoading } = useReplies(parentId, true);
  if (isLoading) {
    return (
      <div className="ml-9 py-2 text-xs text-muted-foreground">Loading…</div>
    );
  }
  return (
    <ul className="space-y-3 pt-1">
      {(replies ?? []).map((r) => (
        <CommentItem
          key={r.id}
          comment={r}
          videoId={videoId}
          currentUserId={currentUserId}
          isModerator={isModerator}
          highlightedId={highlightedId}
          onReply={onReply}
          onReport={onReport}
          isReply
        />
      ))}
    </ul>
  );
};

const EditHistory = ({ commentId }: { commentId: string }) => {
  const { data: edits, isLoading } = useCommentEdits(commentId, true);
  if (isLoading) {
    return (
      <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
        Loading history…
      </div>
    );
  }
  if (!edits || edits.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
        No earlier revisions recorded.
      </div>
    );
  }
  return (
    <ol className="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
      {edits.map((edit) => (
        <li key={edit.id} className="border-l-2 border-primary/40 pl-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {format(new Date(edit.edited_at), "MMM d, yyyy 'at' h:mm a")}
          </div>
          <p className="break-words text-foreground/80">{edit.previous_body}</p>
        </li>
      ))}
    </ol>
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
      void trackEvent("comment_report", {
        props: { comment_id: target.id },
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
