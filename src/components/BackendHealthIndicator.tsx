import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Activity, Zap } from "lucide-react";
import { checkHealth, checkEdgeFunction, fetchEnvDiagnostics, type EnvDiagnosticsResponse } from "@/lib/api";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Status = "checking" | "ok" | "down";

function statusColor(s: Status) {
  return s === "ok"
    ? "border-green-500/40 text-green-600 dark:text-green-400"
    : s === "down"
      ? "border-destructive/50 text-destructive"
      : "border-muted-foreground/30 text-muted-foreground";
}

function StatusBadge({
  status,
  label,
  icon: Icon,
  title,
  onClick,
}: {
  status: Status;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-muted",
        statusColor(status),
      )}
    >
      {status === "checking" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {status === "ok" && <CheckCircle2 className="h-3 w-3" />}
      {status === "down" && <AlertCircle className="h-3 w-3" />}
      {label}
    </button>
  );
}

export function BackendHealthIndicator({ className }: { className?: string }) {
  const [api, setApi] = useState<Status>("checking");
  const [edge, setEdge] = useState<Status>("checking");
  const [time, setTime] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<EnvDiagnosticsResponse | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const ping = async () => {
    setApi("checking");
    setEdge("checking");
    const [h, e] = await Promise.all([checkHealth(), checkEdgeFunction()]);
    setApi(h?.ok ? "ok" : "down");
    setTime(h?.time ?? null);
    setEdge(e?.ok ? "ok" : "down");
  };

  useEffect(() => {
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, []);

  const openDiagnostics = async () => {
    setOpen(true);
    setDiagLoading(true);
    setDiag(await fetchEnvDiagnostics());
    setDiagLoading(false);
  };

  let apiUrl = "";
  try {
    apiUrl = env().API_URL;
  } catch {
    /* env not validated */
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <StatusBadge
        status={api}
        label={api === "ok" ? "Backend" : api === "down" ? "Backend ✕" : "Backend…"}
        icon={Activity}
        title={`API: ${apiUrl}${time ? ` · ${time}` : ""}`}
        onClick={ping}
      />
      <StatusBadge
        status={edge}
        label={edge === "ok" ? "Edge" : edge === "down" ? "Edge ✕" : "Edge…"}
        icon={Zap}
        title="Supabase Edge Function (video-status)"
        onClick={ping}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={openDiagnostics}
      >
        Diagnostics
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Backend diagnostics</DialogTitle>
            <DialogDescription>
              Non-secret runtime info reported by <code>/api/env</code>.
            </DialogDescription>
          </DialogHeader>

          {diagLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {!diagLoading && !diag && (
            <p className="text-sm text-destructive">
              Couldn't reach <code>/api/env</code>. Check that the backend is deployed and{" "}
              <code>VITE_API_URL</code> is correct.
            </p>
          )}

          {!diagLoading && diag && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium">Hostname</div>
                <code className="text-xs text-muted-foreground">{diag.hostname || "—"}</code>
              </div>
              <div>
                <div className="font-medium">Node env</div>
                <code className="text-xs text-muted-foreground">{diag.nodeEnv}</code>
              </div>
              <div>
                <div className="font-medium">Allowed origins</div>
                <ul className="mt-1 space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                  {diag.allowedOrigins.length === 0 && <li className="text-muted-foreground">none</li>}
                  {diag.allowedOrigins.map((o) => (
                    <li key={o}>
                      <code>{o}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium">Env presence</div>
                <ul className="mt-1 grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(diag.present).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-1">
                      {v ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      )}
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(JSON.stringify(diag, null, 2))}
              >
                Copy as JSON
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
