/**
 * Admin-only security dashboard.
 *
 * Reads `public.security_scans` (admin-only SELECT policy) and summarises:
 *   - pending / running scans
 *   - open issues (high + critical still outstanding)
 *   - a timeline of completed and failed runs
 *
 * Writes happen through `public.log_security_scan`, which also audits the run
 * into `security_access_log`.
 */
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ScanRow {
  id: string;
  scanner: string;
  status: string;
  suite: string;
  findings_total: number;
  findings_high: number;
  findings_critical: number;
  open_issues: number;
  baseline_diff: string;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
}

const useScans = () =>
  useQuery({
    queryKey: ["security-scans"],
    staleTime: 30_000,
    queryFn: async (): Promise<ScanRow[]> => {
      const { data, error } = await supabase
        .from("security_scans")
        .select(
          "id, scanner, status, suite, findings_total, findings_high, findings_critical, open_issues, baseline_diff, notes, started_at, completed_at",
        )
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ScanRow[];
    },
  });

const statusTone = (status: string) =>
  status === "completed"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : status === "failed"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-500/40 bg-amber-500/10 text-amber-300";

const Stat = ({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: string;
  icon: React.ReactNode;
}) => (
  <Card className={`border ${tone}`}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </CardContent>
  </Card>
);

const SecurityDashboard = () => {
  const { data: scans, isLoading, error } = useScans();

  useEffect(() => {
    const prev = document.title;
    document.title = "Security Dashboard | Reelo";
    return () => {
      document.title = prev;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = scans ?? [];
    const pending = rows.filter(
      (r) => r.status === "pending" || r.status === "running",
    );
    const finished = rows.filter(
      (r) => r.status === "completed" || r.status === "failed",
    );
    return {
      pending,
      finished,
      openIssues: rows.reduce((n, r) => n + (r.open_issues ?? 0), 0),
      blockers: rows.reduce(
        (n, r) => n + (r.findings_high ?? 0) + (r.findings_critical ?? 0),
        0,
      ),
      lastRun: finished[0] ?? null,
      failing: finished.filter((r) => r.status === "failed").length,
    };
  }, [scans]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <Link
            to="/admin/reports"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to admin
          </Link>
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">
              Security · dashboard
            </p>
            <h1 className="font-serif text-3xl md:text-4xl">Scan status</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pending scans, outstanding issues and a timeline of completed
              runs. Every run recorded here is also audited in the security
              access log.
            </p>
          </div>
          <nav
            aria-label="Security tools"
            className="flex flex-wrap gap-2 text-xs"
          >
            {[
              ["/security/runbook", "Runbook"],
              ["/security/matrix", "Matrix"],
              ["/security/coverage", "Coverage"],
              ["/security/access-log", "Access log"],
              ["/security/exports", "Exports"],
            ].map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scan history…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Scan history unavailable</p>
              <p className="mt-1 text-destructive/80">
                {(error as Error).message}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Pending scans"
                value={summary.pending.length}
                hint={
                  summary.pending.length === 0
                    ? "Nothing queued"
                    : `${summary.pending[0].scanner} awaiting a run`
                }
                tone={
                  summary.pending.length
                    ? "border-amber-500/30"
                    : "border-border"
                }
                icon={<Clock className="h-4 w-4 text-amber-300" />}
              />
              <Stat
                label="Open issues"
                value={summary.openIssues}
                hint={`${summary.blockers} high/critical finding${summary.blockers === 1 ? "" : "s"}`}
                tone={
                  summary.openIssues
                    ? "border-destructive/30"
                    : "border-border"
                }
                icon={
                  summary.openIssues ? (
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  )
                }
              />
              <Stat
                label="Completed runs"
                value={summary.finished.length}
                hint={`${summary.failing} failed`}
                tone="border-border"
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />}
              />
              <Stat
                label="Last run"
                value={
                  summary.lastRun
                    ? formatDistanceToNowStrict(
                        new Date(
                          summary.lastRun.completed_at ??
                            summary.lastRun.started_at,
                        ),
                        { addSuffix: true },
                      )
                    : "—"
                }
                hint={summary.lastRun?.scanner ?? "No runs recorded"}
                tone="border-border"
                icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
              />
            </section>

            {summary.pending.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Pending</h2>
                {summary.pending.map((s) => (
                  <Card key={s.id} className="border-amber-500/30">
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-sm">{s.scanner}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.suite}
                        </p>
                        {s.notes && (
                          <p className="mt-2 max-w-xl text-xs text-muted-foreground">
                            {s.notes}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wide ${statusTone(s.status)}`}
                      >
                        {s.status}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Timeline</h2>
              {summary.finished.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                  No completed runs recorded yet.
                </p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-6">
                  {summary.finished.map((s) => (
                    <li key={s.id} className="relative">
                      <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center">
                        {s.status === "failed" ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        )}
                      </span>
                      <div className="rounded-lg border border-border bg-card/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm">{s.scanner}</p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusTone(s.status)}`}
                          >
                            {s.status}
                          </span>
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            baseline diff: {s.baseline_diff}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDistanceToNowStrict(
                              new Date(s.completed_at ?? s.started_at),
                              { addSuffix: true },
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.suite} · {s.findings_total} finding
                          {s.findings_total === 1 ? "" : "s"} ·{" "}
                          {s.findings_high} high · {s.findings_critical}{" "}
                          critical
                        </p>
                        {s.notes && (
                          <p className="mt-2 text-sm text-foreground/80">
                            {s.notes}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default SecurityDashboard;
