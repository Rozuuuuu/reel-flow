/**
 * Security matrix page.
 *
 * Maps each protected resource to its RLS policy, the public SECURITY INVOKER
 * wrappers those policies call, and the underlying private SECURITY DEFINER
 * helpers. Companion to /security (prose reference) and /security/coverage
 * (test coverage dashboard).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { MATRIX_ROWS, WRAPPER_INDEX } from "@/data/securityMatrix";
import { supabase } from "@/integrations/supabase/client";

const kindBadge: Record<string, string> = {
  table: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  storage: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  realtime: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

/**
 * The `enforce_rate_limit` helper buckets hits by `date_trunc('minute', now())`
 * — so once a caller is throttled, the next allowed request is the start of
 * the following minute. Return the seconds until that boundary for the UI.
 */
function secondsUntilNextMinute(now: Date = new Date()): number {
  return Math.max(1, 60 - now.getSeconds());
}

const RateLimitBanner = ({ retryInSeconds }: { retryInSeconds: number }) => {
  const [remaining, setRemaining] = useState(retryInSeconds);
  useEffect(() => {
    setRemaining(retryInSeconds);
    const t = window.setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [retryInSeconds]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100"
      data-testid="rate-limit-banner"
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">You're viewing this page a lot</p>
        <p className="mt-1 text-amber-100/80">
          Access to the security matrix is rate-limited to 60 requests per minute per user.
          {remaining > 0 ? (
            <> Try again in <span className="font-mono">{remaining}s</span>.</>
          ) : (
            <> You can retry now.</>
          )}
        </p>
      </div>
    </div>
  );
};

const SecurityMatrix = () => {
  const [rateLimitedRetryIn, setRateLimitedRetryIn] = useState<number | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "Security Matrix | Reelo";
    // Server-side logging + rate-limit enforcement. If the DB raises
    // `rate_limit_exceeded`, surface a friendly banner with a retry hint.
    // The <RequireAdmin> gate remains the authoritative access control.
    void supabase
      .rpc("security_matrix_access_check", {
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      .then(({ error }) => {
        if (!error) return;
        const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
        if (haystack.includes("rate_limit_exceeded")) {
          // Prefer the server-provided retry_after hint; fall back to
          // the next-minute boundary if it's missing for any reason.
          const match = haystack.match(/retry_after=(\d+)/);
          const retry = match ? Math.max(1, parseInt(match[1], 10)) : secondsUntilNextMinute();
          setRateLimitedRetryIn(retry);
        }
      });
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-10">
      <article className="mx-auto max-w-6xl space-y-10 text-foreground">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Security · map</p>
          <h1 className="font-serif text-4xl md:text-5xl">Coverage matrix</h1>
          <p className="text-muted-foreground">
            Every protected resource, the RLS policy that guards it, the public wrappers those policies call, and the
            underlying <code className="font-mono text-xs">private.*</code> SECURITY DEFINER helpers.
          </p>
        </header>

        {rateLimitedRetryIn !== null && <RateLimitBanner retryInSeconds={rateLimitedRetryIn} />}

        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Resource → policy → helpers</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Public wrappers</th>
                  <th className="px-4 py-3">SECURITY DEFINER helpers</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX_ROWS.map((row) => (
                  <tr key={row.resource} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-mono text-xs">{row.resource}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${kindBadge[row.kind]}`}>
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{row.policy}</div>
                      {row.notes && <div className="mt-1 text-[11px] italic text-muted-foreground/80">{row.notes}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {row.wrappers.length === 0 ? (
                        <span className="italic text-muted-foreground/70">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {row.wrappers.map((w) => (
                            <li key={w} className="font-mono text-[11px]">{w}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.definers.length === 0 ? (
                        <span className="italic text-muted-foreground/70">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {row.definers.map((d) => (
                            <li key={d} className="font-mono text-[11px] text-amber-300/90">{d}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Wrapper ↔ helper index</h2>
          <p className="text-sm text-muted-foreground">
            Public wrappers are SECURITY INVOKER — they run with the caller's RLS. The privileged work happens in
            <code className="mx-1 font-mono text-xs">private.*</code> SECURITY DEFINER functions that the Data API does
            not expose.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Public wrapper (INVOKER)</th>
                  <th className="px-4 py-3">Private helper (DEFINER)</th>
                  <th className="px-4 py-3">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {WRAPPER_INDEX.map((w) => (
                  <tr key={w.wrapper} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-mono text-[11px]">{w.wrapper}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-amber-300/90">{w.definer}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/security" className="underline">← RLS policy reference</Link>
          <Link to="/security/coverage" className="underline">Coverage dashboard →</Link>
        </footer>
      </article>
    </div>
  );
};

export default SecurityMatrix;
