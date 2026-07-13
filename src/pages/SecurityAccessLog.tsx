/**
 * Admin-only audit page.
 *
 * Reads `public.security_access_log` — every /security/matrix and
 * /security/runbook access attempt (via the `security_matrix_access_check`
 * RPC) is recorded there with the caller's user_id, was_admin flag, path
 * and user_agent. RLS restricts SELECT to admins; this page is additionally
 * wrapped in <RequireAdmin> for UX.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = {
  id: string;
  user_id: string | null;
  path: string;
  was_admin: boolean;
  user_agent: string | null;
  created_at: string;
};

type AdminFilter = "any" | "admin" | "non-admin";

const WINDOWS: { label: string; hours: number }[] = [
  { label: "Last 1 hour", hours: 1 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
];

export default function SecurityAccessLog() {
  const [userIdFilter, setUserIdFilter] = useState("");
  const [hours, setHours] = useState(24);
  const [adminFilter, setAdminFilter] = useState<AdminFilter>("any");

  const sinceIso = useMemo(
    () => new Date(Date.now() - hours * 3600 * 1000).toISOString(),
    [hours],
  );

  const query = useQuery({
    queryKey: ["security-access-log", userIdFilter, hours, adminFilter],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("security_access_log")
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500);
      if (userIdFilter.trim()) q = q.eq("user_id", userIdFilter.trim());
      if (adminFilter !== "any") q = q.eq("was_admin", adminFilter === "admin");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-10">
      <article className="mx-auto max-w-5xl space-y-8 text-foreground">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Security · audit
          </p>
          <h1 className="font-serif text-4xl md:text-5xl">Access log</h1>
          <p className="text-muted-foreground">
            Every attempt to view <code className="font-mono text-xs">/security/matrix</code> or the runbook — admin or
            not, allowed or blocked — is recorded here.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="user-id">User ID</Label>
            <Input
              id="user-id"
              placeholder="uuid or blank for all"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label>Time window</Label>
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.hours} value={String(w.hours)}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Was admin?</Label>
            <Select value={adminFilter} onValueChange={(v) => setAdminFilter(v as AdminFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="admin">Admin only</SelectItem>
                <SelectItem value="non-admin">Non-admin only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </section>

        <section>
          {query.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : query.isError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load access log — admin role required.
            </p>
          ) : !query.data || query.data.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No access attempts match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Path</th>
                    <th className="px-4 py-3">Admin?</th>
                    <th className="px-4 py-3">User agent</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground" title={r.created_at}>
                        {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px]">{r.user_id ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-[11px]">{r.path}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${
                            r.was_admin
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                              : "border-rose-500/30 bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {r.was_admin ? "admin" : "denied"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-muted-foreground line-clamp-2">
                        {r.user_agent ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/admin/reports" className="underline">← Back to admin</Link>
          <Link to="/security/matrix" className="underline">Security matrix →</Link>
        </footer>
      </article>
    </div>
  );
}
