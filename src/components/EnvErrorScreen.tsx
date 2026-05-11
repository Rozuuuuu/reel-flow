import { useState } from "react";
import { AlertTriangle, Copy, Check } from "lucide-react";

interface Props {
  missing: string[];
}

/** Full-screen fallback shown when required env vars aren't configured. */
export function EnvErrorScreen({ missing }: Props) {
  const [copied, setCopied] = useState(false);
  const prefixed = missing.map((k) => `VITE_${k}`);

  const copy = async () => {
    const tpl = prefixed.map((k) => `${k}=`).join("\n");
    try {
      await navigator.clipboard.writeText(tpl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const target =
    typeof window !== "undefined" ? window.location.host : "your deploy target";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-xl w-full rounded-lg border border-destructive/40 bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground">
              Configuration error
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The app can't start on <span className="font-mono">{target}</span>{" "}
              because required environment variables are missing.
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Missing variables</h2>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy missing vars
                  </>
                )}
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm font-mono">
              {prefixed.map((k) => (
                <li
                  key={k}
                  className="rounded bg-muted px-2 py-1 text-foreground break-all"
                >
                  {k}
                </li>
              ))}
            </ul>

            <h2 className="mt-5 text-sm font-medium">Setup steps (Render)</h2>
            <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
              <li>
                Open Render → your service →{" "}
                <span className="font-medium text-foreground">Environment</span>.
              </li>
              <li>
                Add each variable above. Get the values from the Lovable Cloud
                backend panel:
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  <li>
                    <span className="font-mono">VITE_SUPABASE_URL</span> — the
                    Project URL (https://&lt;ref&gt;.supabase.co)
                  </li>
                  <li>
                    <span className="font-mono">
                      VITE_SUPABASE_PUBLISHABLE_KEY
                    </span>{" "}
                    — the anon/publishable key
                  </li>
                  <li>
                    <span className="font-mono">VITE_SUPABASE_PROJECT_ID</span>{" "}
                    — the project ref
                  </li>
                </ul>
              </li>
              <li>
                Optional:{" "}
                <span className="font-mono">VITE_API_URL</span> — defaults to{" "}
                <span className="font-mono">/api</span> (Render reverse-proxies
                to the backend service). Set to the full backend URL only for
                cross-origin setups.
              </li>
              <li>
                Trigger a redeploy — these vars are read at build time.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
