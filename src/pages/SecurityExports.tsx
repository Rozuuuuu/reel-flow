/**
 * Admin-only view of CSV export attempts against /security/access-log.
 *
 * Every export call goes through the `log_security_export` RPC which writes a
 * row into `public.security_access_log` with:
 *   - path = '/security/access-log/export?' + JSON.stringify(filters)
 *   - filters JSON includes `outcome` (started|succeeded|failed|empty), the
 *     applied sort/pagination, and any error message.
 *
 * This page reads those rows, parses the JSON payload, and lets an admin
 * filter by user, outcome, path substring (matches the original filter's
 * `path`), and time window.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";


type RawRow = {
  id: string;
  user_id: string | null;
  path: string;
  user_agent: string | null;
  created_at: string;
};

type ExportRow = RawRow & {
  filters: Record<string, unknown> | null;
  outcome: string;
};

const EXPORT_PATH_PREFIX = "/security/access-log/export?";
const PAGE_SIZE = 50;

const WINDOWS: { label: string; hours: number }[] = [
  { label: "Last 1 hour", hours: 1 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
];

type OutcomeFilter = "any" | "started" | "succeeded" | "failed" | "empty";

const OUTCOME_STYLE: Record<string, string> = {
  succeeded: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  started: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  empty: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  failed: "border-rose-500/30 bg-rose-500/15 text-rose-300",
};

function parseFilters(path: string): { filters: Record<string, unknown> | null; outcome: string } {
  if (!path.startsWith(EXPORT_PATH_PREFIX)) return { filters: null, outcome: "unknown" };
  const raw = path.slice(EXPORT_PATH_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const outcome = typeof parsed.outcome === "string" ? parsed.outcome : "unknown";
    return { filters: parsed, outcome };
  } catch {
    return { filters: null, outcome: "unknown" };
  }
}

export default function SecurityExports() {
  const [userIdFilter, setUserIdFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [hours, setHours] = useState(24 * 7);
  const [outcome, setOutcome] = useState<OutcomeFilter>("any");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ExportRow | null>(null);


  const sinceIso = useMemo(
    () => new Date(Date.now() - hours * 3600 * 1000).toISOString(),
    [hours],
  );

  const query = useQuery({
    queryKey: ["security-exports", userIdFilter, pathFilter, hours, outcome, page],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: ExportRow[]; count: number }> => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("security_access_log")
        .select("id,user_id,path,user_agent,created_at", { count: "exact" })
        .ilike("path", `${EXPORT_PATH_PREFIX}%`)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (userIdFilter.trim()) q = q.eq("user_id", userIdFilter.trim());
      if (outcome !== "any") q = q.ilike("path", `%\"outcome\":\"${outcome}\"%`);
      if (pathFilter.trim()) q = q.ilike("path", `%\"path\":\"%${pathFilter.trim()}%\"%`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error, count } = await (q as any);
      if (error) throw error;
      const rows = ((data ?? []) as RawRow[]).map<ExportRow>((r) => ({
        ...r,
        ...parseFilters(r.path),
      }));
      return { rows, count: count ?? 0 };
    },
  });

  const total = query.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resetPage = () => setPage(0);

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-10">
      <article className="mx-auto max-w-5xl space-y-8 text-foreground">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Security · audit
          </p>
          <h1 className="font-serif text-4xl md:text-5xl">Export audit log</h1>
          <p className="text-muted-foreground">
            Every CSV export from the access log page — started, succeeded, empty, or failed —
            with the exact filters, sort, and pagination that were in effect.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-4">
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
            <Label htmlFor="path-filter">Path filter contains</Label>
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
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={(v) => { setOutcome(v as OutcomeFilter); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section>
          {query.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : query.isError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load export audit log — admin role required.
            </p>
          ) : !query.data || query.data.rows.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No export attempts match these filters.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Request ID</th>
                      <th className="px-4 py-3">Outcome</th>
                      <th className="px-4 py-3">Rows</th>
                      <th className="px-4 py-3">Filters / sort / page</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {query.data.rows.map((r) => {
                      const f = r.filters ?? {};
                      const chip = (label: string, value: unknown) =>
                        value === null || value === undefined || value === "" ? null : (
                          <span
                            key={label}
                            className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {label}: {String(value)}
                          </span>
                        );
                      return (
                        <tr key={r.id} className="border-t border-border align-top">
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground" title={r.created_at}>
                            {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}
                          </td>
                          <td className="px-4 py-2 font-mono text-[11px]">{r.user_id ?? "—"}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${
                                OUTCOME_STYLE[r.outcome] ?? "border-border bg-muted text-muted-foreground"
                              }`}
                            >
                              {r.outcome}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-[11px]">
                            {typeof f.rows === "number" ? f.rows : "—"}
                            {f.capped ? <span className="ml-1 text-amber-400">(capped)</span> : null}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {chip("user", f.user_id)}
                              {chip("path", f.path)}
                              {chip("admin", f.admin_filter)}
                              {chip("sort", f.sort ? `${f.sort} ${f.dir}` : null)}
                              {chip("scope", f.scope)}
                              {chip("page", typeof f.page === "number" ? f.page + 1 : null)}
                              {f.error ? (
                                <span className="w-full break-all rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
                                  {String(f.error)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
          <Link to="/security/access-log" className="underline">← Access log</Link>
          <Link to="/admin/reports" className="underline">Admin →</Link>
        </footer>
      </article>
    </div>
  );
}
