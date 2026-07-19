/**
 * Admin-only audit page.
 *
 * Reads `public.security_access_log` — every /security/matrix and
 * /security/runbook access attempt (via the `security_matrix_access_check`
 * RPC) is recorded there with the caller's user_id, was_admin flag, path
 * and user_agent. RLS restricts SELECT to admins; this page is additionally
 * wrapped in <RequireAdmin> for UX.
 *
 * Server-side pagination is used so filtering stays fast as the log grows —
 * the table is indexed on (user_id, was_admin, created_at DESC) and
 * (was_admin, created_at DESC) to keep every filter shape on an index scan.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Download, Loader2 } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";

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

const PAGE_SIZE = 50;
// Safety cap on a single CSV export — the underlying table is admin-only but
// we still want to bound memory and download size.
const CSV_EXPORT_LIMIT = 10_000;

type Filters = {
  userIdFilter: string;
  sinceIso: string;
  adminFilter: AdminFilter;
  pathFilter: string;
};

/**
 * Build the base filtered query. Kept as a helper so the table view and the
 * CSV export share the exact same filter semantics — otherwise it's easy to
 * drift and export a superset of what the user sees.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends { gte: any; eq: any; ilike: any }>(
  base: T,
  { userIdFilter, sinceIso, adminFilter, pathFilter }: Filters,
): T {
  let q: T = base.gte("created_at", sinceIso);
  if (userIdFilter.trim()) q = q.eq("user_id", userIdFilter.trim());
  if (adminFilter !== "any") q = q.eq("was_admin", adminFilter === "admin");
  if (pathFilter.trim()) q = q.ilike("path", `%${pathFilter.trim()}%`);
  return q;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Row[]): string {
  const header = ["created_at", "user_id", "path", "was_admin", "user_agent"];
  const body = rows.map((r) =>
    [r.created_at, r.user_id ?? "", r.path, r.was_admin, r.user_agent ?? ""].map(csvEscape).join(","),
  );
  return [header.join(","), ...body].join("\n");
}

export default function SecurityAccessLog() {
  const [userIdFilter, setUserIdFilter] = useState("");
  const [hours, setHours] = useState(24);
  const [adminFilter, setAdminFilter] = useState<AdminFilter>("any");
  const [pathFilter, setPathFilter] = useState("");
  const [page, setPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const sinceIso = useMemo(
    () => new Date(Date.now() - hours * 3600 * 1000).toISOString(),
    [hours],
  );

  const filters: Filters = { userIdFilter, sinceIso, adminFilter, pathFilter };

  const query = useQuery({
    queryKey: ["security-access-log", userIdFilter, hours, adminFilter, pathFilter, page],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: Row[]; count: number }> => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const base = supabase
        .from("security_access_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error, count } = await applyFilters(base, filters);
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const total = query.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Reset to first page whenever a filter changes.
  const resetPage = () => setPage(0);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      // Server-side audit: record who exported which filters BEFORE running the
      // query, so the log survives even if the export itself fails midway.
      // The RPC is admin-gated + rate-limited (30/min/user) in the DB.
      const { error: logError } = await supabase.rpc("log_security_export", {
        _filters: {
          user_id: userIdFilter.trim() || null,
          since: sinceIso,
          admin_filter: adminFilter,
          path: pathFilter.trim() || null,
        },
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (logError) throw logError;

      const base = supabase
        .from("security_access_log")
        .select("id,user_id,path,was_admin,user_agent,created_at")
        .order("created_at", { ascending: false })
        .limit(CSV_EXPORT_LIMIT);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await applyFilters(base, filters);
      if (error) throw error;
      const rows = (data ?? []) as Row[];

      if (rows.length === 0) {
        toast({ title: "Nothing to export", description: "No entries match the current filters." });
        return;
      }
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security-access-log-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description:
          rows.length >= CSV_EXPORT_LIMIT
            ? `Exported ${rows.length} rows (capped). Narrow the filters to export the rest.`
            : `Exported ${rows.length} row${rows.length === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

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

        <section className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="user-id">User ID</Label>
            <Input
              id="user-id"
              placeholder="uuid or blank for all"
              value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); resetPage(); }}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="path-filter">Path contains</Label>
            <Input
              id="path-filter"
              placeholder="e.g. /security/matrix"
              value={pathFilter}
              onChange={(e) => { setPathFilter(e.target.value); resetPage(); }}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label>Time window</Label>
            <Select value={String(hours)} onValueChange={(v) => { setHours(Number(v)); resetPage(); }}>
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
            <Select value={adminFilter} onValueChange={(v) => { setAdminFilter(v as AdminFilter); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="admin">Admin only</SelectItem>
                <SelectItem value="non-admin">Non-admin only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
            <Button
              variant="default"
              onClick={handleExportCsv}
              disabled={isExporting || query.isLoading}
              data-testid="export-csv"
              aria-label="Export filtered results as CSV"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">CSV</span>
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
          ) : !query.data || query.data.rows.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No access attempts match these filters.
            </p>
          ) : (
            <>
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
                    {query.data.rows.map((r) => (
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
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  Showing <span className="font-mono">{page * PAGE_SIZE + 1}</span>–
                  <span className="font-mono">{page * PAGE_SIZE + query.data.rows.length}</span> of{" "}
                  <span className="font-mono">{total}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0 || query.isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="font-mono">
                    Page {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= totalPages || query.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
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
