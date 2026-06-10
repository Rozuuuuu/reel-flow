/**
 * Security coverage dashboard.
 *
 * Renders a live matrix of every protected resource (tables, storage buckets,
 * realtime topics) and which automated tests cover it, plus a CI pass/fail
 * history per PR. The matrix is sourced from src/data/securityCoverage.ts;
 * the history is hydrated from /security-coverage-history.json when present
 * (CI appends entries there), otherwise falls back to the in-code seed.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  COVERAGE_ROWS,
  SEED_HISTORY,
  type CoverageStatus,
  type PrRunSummary,
} from "@/data/securityCoverage";

const statusBadge: Record<CoverageStatus, string> = {
  covered: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  uncovered: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const resultPill = (r: "pass" | "fail") =>
  r === "pass"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : "bg-rose-500/15 text-rose-300 border-rose-500/30";

const SecurityCoverage = () => {
  const [history, setHistory] = useState<PrRunSummary[]>(SEED_HISTORY);

  useEffect(() => {
    const prev = document.title;
    document.title = "Security Coverage | Reelo";
    fetch("/security-coverage-history.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length) setHistory(data);
      })
      .catch(() => {});
    return () => {
      document.title = prev;
    };
  }, []);

  const stats = useMemo(() => {
    const total = COVERAGE_ROWS.length;
    const covered = COVERAGE_ROWS.filter((r) => r.status === "covered").length;
    const partial = COVERAGE_ROWS.filter((r) => r.status === "partial").length;
    const uncovered = COVERAGE_ROWS.filter((r) => r.status === "uncovered").length;
    const ciCovered = COVERAGE_ROWS.filter((r) => r.ci).length;
    return { total, covered, partial, uncovered, ciCovered, pct: Math.round((covered / total) * 100) };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-10">
      <article className="mx-auto max-w-5xl space-y-10 text-foreground">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Security · live</p>
          <h1 className="font-serif text-4xl md:text-5xl">Coverage dashboard</h1>
          <p className="text-muted-foreground">
            Which tables, buckets, and realtime topics are exercised by automated tests, which run on every PR, and how the
            last few runs fared.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Resources" value={stats.total} />
          <Stat label="Covered" value={stats.covered} tone="ok" />
          <Stat label="Partial" value={stats.partial} tone="warn" />
          <Stat label="Uncovered" value={stats.uncovered} tone={stats.uncovered ? "bad" : "ok"} />
          <Stat label="On CI" value={`${stats.ciCovered}/${stats.total}`} />
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Coverage matrix</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Tests</th>
                  <th className="px-4 py-3">CI</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {COVERAGE_ROWS.map((row) => (
                  <tr key={row.resource} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-mono text-xs">{row.resource}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.kind}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.policy}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.tests.length === 0 ? (
                        <span className="italic text-rose-300/70">none</span>
                      ) : (
                        <ul className="space-y-1">
                          {row.tests.map((t) => (
                            <li key={t} className="font-mono text-[11px]">{t}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.ci ? "Yes" : "No"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${statusBadge[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Recent PR runs</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">PR</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">SHA</th>
                  <th className="px-4 py-3">RLS</th>
                  <th className="px-4 py-3">API</th>
                  <th className="px-4 py-3">Realtime</th>
                  <th className="px-4 py-3">Scan diff</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run) => (
                  <tr key={`${run.pr}-${run.sha}`} className="border-t border-border">
                    <td className="px-4 py-3">#{run.pr}</td>
                    <td className="px-4 py-3 text-muted-foreground">{run.title}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{run.sha}</td>
                    <td className="px-4 py-3"><Pill className={resultPill(run.rls)}>{run.rls}</Pill></td>
                    <td className="px-4 py-3"><Pill className={resultPill(run.api)}>{run.api}</Pill></td>
                    <td className="px-4 py-3"><Pill className={resultPill(run.realtime)}>{run.realtime}</Pill></td>
                    <td className="px-4 py-3"><Pill className={resultPill(run.scanDiff)}>{run.scanDiff}</Pill></td>
                    <td className="px-4 py-3 text-muted-foreground">{run.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/security" className="underline">← RLS policy reference</Link>
          <Link to="/" className="underline">Back to feed</Link>
        </footer>
      </article>
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" | "bad" }) => {
  const color =
    tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-serif text-3xl ${color}`}>{value}</div>
    </div>
  );
};

const Pill = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${className}`}>{children}</span>
);

export default SecurityCoverage;
