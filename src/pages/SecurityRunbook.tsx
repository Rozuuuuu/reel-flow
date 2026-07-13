/**
 * Admin-only runbook viewer.
 *
 * The raw markdown is NEVER bundled into the client. It is served by the
 * `security-runbook` edge function, which verifies the caller's JWT and
 * enforces the `admin` role server-side. The surrounding <RequireAdmin>
 * gate is a UX signal — the edge function is the authoritative check.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State =
  | { status: "loading" }
  | { status: "ok"; markdown: string }
  | { status: "error"; message: string };

const SecurityRunbook = () => {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const prev = document.title;
    document.title = "Security Runbook | Reelo";
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.functions.invoke<Blob>(
        "security-runbook",
        { method: "GET" },
      );
      if (cancelled) return;
      if (error) {
        setState({
          status: "error",
          message:
            error.message ||
            "The runbook could not be loaded. Your session may lack the admin role.",
        });
        return;
      }
      const text =
        typeof data === "string"
          ? data
          : data instanceof Blob
            ? await data.text()
            : String(data);
      setState({ status: "ok", markdown: text });
    })();

    return () => {
      cancelled = true;
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
            Admin-only. Served server-side via the <code className="font-mono text-xs">security-runbook</code> edge
            function — the markdown never ships in the client bundle.
          </p>
        </header>

        {state.status === "loading" && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching runbook…
          </div>
        )}

        {state.status === "error" && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Runbook unavailable</p>
              <p className="mt-1 text-destructive/80">{state.message}</p>
            </div>
          </div>
        )}

        {state.status === "ok" && (
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-6 font-mono text-xs leading-relaxed text-foreground">
            {state.markdown}
          </pre>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/admin/reports" className="underline">← Back to admin</Link>
          <Link to="/security/matrix" className="underline">Security matrix →</Link>
        </footer>
      </article>
    </div>
  );
};

export default SecurityRunbook;
