import { AlertTriangle } from "lucide-react";

interface Props {
  missing: string[];
}

/** Full-screen fallback shown when required env vars aren't configured. */
export function EnvErrorScreen({ missing }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full rounded-lg border border-destructive/40 bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              Configuration error
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The app can't start because required environment variables are
              missing. Set the following in your hosting environment (Render
              → Environment) and redeploy:
            </p>
            <ul className="mt-3 space-y-1 text-sm font-mono">
              {missing.map((k) => (
                <li
                  key={k}
                  className="rounded bg-muted px-2 py-1 text-foreground"
                >
                  VITE_{k}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Optional: <span className="font-mono">VITE_API_URL</span> (defaults
              to <span className="font-mono">/api</span>, proxied by Render to
              the backend service).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
