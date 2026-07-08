/**
 * Admin-only runbook viewer. The markdown source is imported as raw text via
 * Vite's `?raw` query, so it never ships as a directly reachable static asset —
 * the surrounding <RequireAdmin> gate is the only entry point.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import runbookMd from "../../docs/SECURITY_RUNBOOK.md?raw";

const SecurityRunbook = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "Security Runbook | Reelo";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-10">
      <article className="mx-auto max-w-3xl space-y-6 text-foreground">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Security · runbook
          </p>
          <h1 className="font-serif text-4xl md:text-5xl">Operational runbook</h1>
          <p className="text-muted-foreground">
            Admin-only. Explains how to run the full scan suite locally, interpret
            baseline diffs, and troubleshoot CI failures.
          </p>
        </header>

        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-6 font-mono text-xs leading-relaxed text-foreground">
          {runbookMd}
        </pre>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/admin/reports" className="underline">← Back to admin</Link>
          <Link to="/security/matrix" className="underline">Security matrix →</Link>
        </footer>
      </article>
    </div>
  );
};

export default SecurityRunbook;
