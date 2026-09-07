/**
 * Admin-only email alert settings for the security dashboard.
 *
 * Reads/writes `public.security_alert_settings` (admin-only RLS) and lists
 * recent `public.security_alerts_sent` rows. The "Run alert check" button
 * invokes the `security-alerts` edge function, which dedupes per scan+kind.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Send } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface AlertSettings {
  id: string;
  recipients: string[];
  notify_pending: boolean;
  notify_failed: boolean;
  notify_drift: boolean;
  pending_after_minutes: number;
  enabled: boolean;
}

interface AlertSent {
  id: string;
  kind: string;
  subject: string;
  status: string;
  error: string | null;
  recipients: string[];
  created_at: string;
}

export const SecurityAlertSettingsCard = () => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AlertSettings | null>(null);
  const [recipientsText, setRecipientsText] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["security-alert-settings"],
    queryFn: async (): Promise<AlertSettings | null> => {
      const { data, error } = await supabase
        .from("security_alert_settings")
        .select(
          "id, recipients, notify_pending, notify_failed, notify_drift, pending_after_minutes, enabled",
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as AlertSettings) ?? null;
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["security-alerts-sent"],
    queryFn: async (): Promise<AlertSent[]> => {
      const { data, error } = await supabase
        .from("security_alerts_sent")
        .select("id, kind, subject, status, error, recipients, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AlertSent[];
    },
  });

  useEffect(() => {
    if (settings) {
      setDraft(settings);
      setRecipientsText(settings.recipients.join(", "));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const recipients = recipientsText
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { error } = await supabase
        .from("security_alert_settings")
        .update({
          recipients,
          notify_pending: draft.notify_pending,
          notify_failed: draft.notify_failed,
          notify_drift: draft.notify_drift,
          pending_after_minutes: draft.pending_after_minutes,
          enabled: draft.enabled,
        })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert settings saved");
      qc.invalidateQueries({ queryKey: ["security-alert-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("security-alerts");
      if (error) throw error;
      return data as { sent?: number; skipped?: string; considered?: number };
    },
    onSuccess: (data) => {
      if (data?.skipped) toast.message(`No alerts sent (${data.skipped})`);
      else toast.success(`${data?.sent ?? 0} of ${data?.considered ?? 0} alerts sent`);
      qc.invalidateQueries({ queryKey: ["security-alerts-sent"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" />
          Email alerts
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
        >
          {runCheck.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-2 h-3.5 w-3.5" />
          )}
          Run alert check
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        )}
        {!isLoading && !draft && (
          <p className="text-sm text-muted-foreground">
            No alert settings row found.
          </p>
        )}
        {draft && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alert-recipients">Recipients</Label>
              <Input
                id="alert-recipients"
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                placeholder="you@example.com, ops@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Comma separated. Alerts are grouped per scan and sent once.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["enabled", "Alerts enabled"],
                  ["notify_pending", "New pending scans"],
                  ["notify_failed", "Failed runs"],
                  ["notify_drift", "Grant drift"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <Label htmlFor={`alert-${key}`} className="text-sm">
                    {label}
                  </Label>
                  <Switch
                    id={`alert-${key}`}
                    checked={draft[key]}
                    onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="alert-minutes">
                Alert on pending scans older than (minutes)
              </Label>
              <Input
                id="alert-minutes"
                type="number"
                min={1}
                value={draft.pending_after_minutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pending_after_minutes: Number(e.target.value) || 1,
                  })
                }
                className="max-w-[160px]"
              />
            </div>

            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save settings
            </Button>
          </>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Recent alerts</h3>
          {!recent || recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No alerts sent yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-border bg-card/60 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{a.kind}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${
                        a.status === "sent"
                          ? "border-emerald-500/40 text-emerald-300"
                          : "border-destructive/40 text-destructive"
                      }`}
                    >
                      {a.status}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(a.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-foreground/80">{a.subject}</p>
                  <p className="text-muted-foreground">
                    {a.recipients.join(", ")}
                  </p>
                  {a.error && (
                    <p className="mt-1 text-destructive/80">{a.error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
