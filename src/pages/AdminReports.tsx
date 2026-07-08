import { useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsModerator } from "@/hooks/useComments";
import { useIsAdmin } from "@/components/RequireAdmin";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Loader2,
  EyeOff,
  Eye,
  Trash2,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { trackEvent } from "@/lib/analytics";

type ReportStatus = "pending" | "reviewed" | "dismissed";

interface ReportRow {
  id: string;
  comment_id: string;
  reporter_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  comment: {
    id: string;
    body: string;
    user_id: string;
    video_id: string;
    hidden_at: string | null;
    created_at: string;
    profile: {
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
}

const useReports = (status: ReportStatus, enabled: boolean) => {
  return useQuery({
    queryKey: ["mod-reports", status],
    enabled,
    queryFn: async (): Promise<ReportRow[]> => {
      const { data: reports, error } = await supabase
        .from("comment_reports")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (reports ?? []) as Omit<ReportRow, "comment">[];
      const commentIds = Array.from(new Set(rows.map((r) => r.comment_id)));
      if (commentIds.length === 0) return rows.map((r) => ({ ...r, comment: null }));

      const { data: comments } = await supabase
        .from("comments")
        .select("id, body, user_id, video_id, hidden_at, created_at")
        .in("id", commentIds);
      const userIds = Array.from(
        new Set((comments ?? []).map((c) => c.user_id)),
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
      const commentById = new Map(
        (comments ?? []).map((c) => [
          c.id,
          { ...c, profile: profById.get(c.user_id) ?? null },
        ]),
      );
      return rows.map((r) => ({
        ...r,
        comment: commentById.get(r.comment_id) ?? null,
      }));
    },
  });
};

export default function AdminReports() {
  const { user, loading } = useAuth();
  const { data: isMod, isLoading: roleLoading } = useIsModerator(user?.id);
  const [tab, setTab] = useState<ReportStatus>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data: reports, isLoading } = useReports(tab, !!isMod);

  const visibleIds = useMemo(
    () => (reports ?? []).map((r) => r.id),
    [reports],
  );
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleIds));
  };
  const toggleOne = (id: string) => {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mod-reports"] });
  };

  const bulkAction = useMutation({
    mutationFn: async (action: "hide" | "unhide" | "remove" | "dismiss") => {
      const reportIds = Array.from(selected);
      const targets = (reports ?? []).filter((r) => selected.has(r.id));
      const commentIds = Array.from(
        new Set(targets.map((r) => r.comment_id)),
      );

      if (action === "hide" || action === "unhide") {
        const { error } = await supabase
          .from("comments")
          .update({ hidden_at: action === "hide" ? new Date().toISOString() : null })
          .in("id", commentIds);
        if (error) throw error;
      } else if (action === "remove") {
        const { error } = await supabase
          .from("comments")
          .delete()
          .in("id", commentIds);
        if (error) throw error;
      }

      // Mark reports as reviewed (or dismissed) — except when re-opening via "unhide" on dismissed tab
      const newStatus: ReportStatus =
        action === "dismiss" ? "dismissed" : "reviewed";
      const { error: reportErr } = await supabase
        .from("comment_reports")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id ?? null,
        })
        .in("id", reportIds);
      if (reportErr) throw reportErr;

      void trackEvent("mod_bulk_action", {
        props: { action, count: reportIds.length },
      });
      return reportIds.length;
    },
    onSuccess: (count, action) => {
      toast.success(`Applied "${action}" to ${count} report${count === 1 ? "" : "s"}`);
      setSelected(new Set());
      invalidate();
    },
    onError: () => toast.error("Bulk action failed"),
  });

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isMod) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Moderators only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to this page.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/">Back to feed</Link>
        </Button>
      </div>
    );
  }

  const selectionCount = selected.size;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            to="/profile"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Comment reports</h1>
          <p className="text-sm text-muted-foreground">
            Review and act on flagged comments. Bulk actions apply to every
            selected report.
          </p>
        </div>
        <nav aria-label="Admin tools" className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            to="/security/matrix"
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Security matrix
          </Link>
          <a
            href="/security-runbook.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Runbook
          </a>
        </nav>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as ReportStatus); setSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all reports"
                />
                <CardTitle className="text-base">
                  {selectionCount > 0
                    ? `${selectionCount} selected`
                    : `${reports?.length ?? 0} report${(reports?.length ?? 0) === 1 ? "" : "s"}`}
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionCount === 0 || bulkAction.isPending}
                  onClick={() => bulkAction.mutate("hide")}
                >
                  <EyeOff className="mr-1 h-4 w-4" />
                  Hide
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionCount === 0 || bulkAction.isPending}
                  onClick={() => bulkAction.mutate("unhide")}
                >
                  <Eye className="mr-1 h-4 w-4" />
                  Unhide
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={selectionCount === 0 || bulkAction.isPending}
                  onClick={() => bulkAction.mutate("remove")}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={selectionCount === 0 || bulkAction.isPending}
                  onClick={() => bulkAction.mutate("dismiss")}
                >
                  Dismiss
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !reports || reports.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No {tab} reports.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {reports.map((r) => (
                    <li key={r.id} className="flex gap-3 px-4 py-3">
                      <Checkbox
                        className="mt-1"
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleOne(r.id)}
                        aria-label={`Select report ${r.id}`}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            Reported{" "}
                            {formatDistanceToNowStrict(new Date(r.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {r.comment?.hidden_at && (
                            <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-semibold uppercase text-destructive">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-xs">
                          <span className="font-semibold text-foreground">
                            Reason:
                          </span>{" "}
                          {r.reason}
                        </p>
                        {r.comment ? (
                          <div className="rounded-md border border-border bg-muted/30 p-2 text-sm">
                            <div className="mb-0.5 text-xs text-muted-foreground">
                              @{r.comment.profile?.username ?? "unknown"} ·{" "}
                              {formatDistanceToNowStrict(
                                new Date(r.comment.created_at),
                                { addSuffix: true },
                              )}
                            </div>
                            <p className="break-words">{r.comment.body}</p>
                            {r.comment.video_id && (
                              <Link
                                to={`/?v=${r.comment.video_id}&c=${r.comment.id}`}
                                className="mt-1 inline-block text-xs text-primary hover:underline"
                              >
                                Open in feed →
                              </Link>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            Original comment was deleted.
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
