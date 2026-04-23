import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Trash2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  useComments,
  useAddComment,
  useDeleteComment,
  useCommentsRealtime,
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
  const { data: comments, isLoading } = useComments(open ? videoId : undefined);
  useCommentsRealtime(open ? videoId : undefined);
  const addMutation = useAddComment(videoId);
  const deleteMutation = useDeleteComment(videoId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await addMutation.mutateAsync({ userId: user.id, body: trimmed });
      setBody("");
      void trackEvent("comment_create", { props: { video_id: videoId } });
    } catch (err) {
      toast.error("Couldn't post comment");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[80dvh] flex-col gap-0 rounded-t-2xl border-border bg-card p-0 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" />
            Comments
            {comments && (
              <span className="text-sm font-normal text-muted-foreground">
                {comments.length}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !comments || comments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8" />
              <p className="text-sm">No comments yet. Be the first.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={c.profile?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="bg-gradient-brand text-xs text-white">
                      {(c.profile?.username ?? "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">
                        @{c.profile?.username ?? "unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(c.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="break-words text-sm leading-snug">{c.body}</p>
                  </div>
                  {user?.id === c.user_id && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(c.id)}
                      aria-label="Delete comment"
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-2 border-t border-border bg-card px-3 py-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={user ? "Add a comment…" : "Sign in to comment"}
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
      </SheetContent>
    </Sheet>
  );
};
