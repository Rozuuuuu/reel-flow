import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { checkHealth } from "@/lib/api";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

type Status = "checking" | "ok" | "down";

/** Small badge that pings /api/health and shows backend connectivity status. */
export function BackendHealthIndicator({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [time, setTime] = useState<string | null>(null);

  const ping = async () => {
    setStatus("checking");
    const r = await checkHealth();
    if (r?.ok) {
      setStatus("ok");
      setTime(r.time ?? null);
    } else {
      setStatus("down");
    }
  };

  useEffect(() => {
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, []);

  const color =
    status === "ok"
      ? "border-green-500/40 text-green-600 dark:text-green-400"
      : status === "down"
        ? "border-destructive/50 text-destructive"
        : "border-muted-foreground/30 text-muted-foreground";

  const label =
    status === "ok" ? "Backend online" : status === "down" ? "Backend unreachable" : "Checking…";

  let apiUrl = "";
  try {
    apiUrl = env().API_URL;
  } catch {
    /* env not validated yet */
  }

  return (
    <button
      type="button"
      onClick={ping}
      title={`API: ${apiUrl}${time ? ` · ${time}` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-muted",
        color,
        className,
      )}
    >
      {status === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "ok" && <CheckCircle2 className="h-3 w-3" />}
      {status === "down" && <AlertCircle className="h-3 w-3" />}
      {label}
    </button>
  );
}
