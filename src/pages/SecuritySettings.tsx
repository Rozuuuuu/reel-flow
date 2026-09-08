/**
 * Admin-only security settings.
 *
 * Three tunables, all server-enforced:
 *   - email alert settings (`public.security_alert_settings`)
 *   - rate-limit thresholds (`public.security_rate_limits`, read by
 *     `private.enforce_rate_limit`)
 *   - the expected grant matrix (`public.matrix_expected_grants`, compared by
 *     `private.matrix_grant_drift()`)
 *
 * Every table has admin-only RLS, so a non-admin session can neither read nor
 * write these rows even if the UI were reachable.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gauge, Loader2, Plus, Save, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecurityAlertSettingsCard } from "@/components/SecurityAlertSettingsCard";

const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

interface RateLimitRow {
  bucket: string;
  limit_per_min: number;
  description: string | null;
}

interface GrantRow {
  table_name: string;
  grantee: string;
  privileges: string[];
}

const RateLimitsCard = () => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, number>>({});

  const { data: rows, isLoading } = useQuery({
    queryKey: ["security-rate-limits"],
    queryFn: async (): Promise<RateLimitRow[]> => {
      const { data, error } = await supabase
        .from("security_rate_limits")
        .select("bucket, limit_per_min, description")
        .order("bucket");
      if (error) throw error;
      return (data ?? []) as RateLimitRow[];
    },
  });

  useEffect(() => {
    if (rows) {
      setDraft(
        Object.fromEntries(rows.map((r) => [r.bucket, r.limit_per_min])),
      );
    }
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      for (const row of rows ?? []) {
        const next = draft[row.bucket];
        if (!next || next === row.limit_per_min) continue;
        const { error } = await supabase
          .from("security_rate_limits")
          .update({ limit_per_min: next })
          .eq("bucket", row.bucket);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Rate limits saved");
      qc.invalidateQueries({ queryKey: ["security-rate-limits"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" />
          Rate limits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Requests allowed per minute, per signed-in user. The database enforces
          these values directly — no redeploy needed.
        </p>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading thresholds…</p>
        )}
        {(rows ?? []).map((row) => (
          <div
            key={row.bucket}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-[180px] flex-1">
              <Label htmlFor={`rl-${row.bucket}`} className="font-mono text-xs">
                {row.bucket}
              </Label>
              {row.description && (
                <p className="text-xs text-muted-foreground">
                  {row.description}
                </p>
              )}
            </div>
            <Input
              id={`rl-${row.bucket}`}
              type="number"
              min={1}
              className="max-w-[120px]"
              value={draft[row.bucket] ?? row.limit_per_min}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [row.bucket]: Number(e.target.value) || 1,
                })
              }
            />
            <span className="text-xs text-muted-foreground">/ min</span>
          </div>
        ))}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save rate limits
        </Button>
      </CardContent>
    </Card>
  );
};

const MatrixCard = () => {
  const qc = useQueryClient();
  const [newRow, setNewRow] = useState({ table_name: "", grantee: "authenticated" });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["matrix-expected-grants"],
    queryFn: async (): Promise<GrantRow[]> => {
      const { data, error } = await supabase
        .from("matrix_expected_grants")
        .select("table_name, grantee, privileges")
        .order("table_name")
        .order("grantee");
      if (error) throw error;
      return (data ?? []) as GrantRow[];
    },
  });

  const update = useMutation({
    mutationFn: async (row: GrantRow) => {
      const { error } = await supabase
        .from("matrix_expected_grants")
        .update({ privileges: row.privileges })
        .eq("table_name", row.table_name)
        .eq("grantee", row.grantee);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expected permissions updated");
      qc.invalidateQueries({ queryKey: ["matrix-expected-grants"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (row: GrantRow) => {
      const { error } = await supabase
        .from("matrix_expected_grants")
        .delete()
        .eq("table_name", row.table_name)
        .eq("grantee", row.grantee);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row removed");
      qc.invalidateQueries({ queryKey: ["matrix-expected-grants"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!newRow.table_name.trim()) throw new Error("Table name is required");
      const { error } = await supabase.from("matrix_expected_grants").insert({
        table_name: newRow.table_name.trim(),
        grantee: newRow.grantee.trim(),
        privileges: ["SELECT"],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row added");
      setNewRow({ table_name: "", grantee: "authenticated" });
      qc.invalidateQueries({ queryKey: ["matrix-expected-grants"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggle = (row: GrantRow, priv: string) => {
    const privileges = row.privileges.includes(priv)
      ? row.privileges.filter((p) => p !== priv)
      : [...row.privileges, priv];
    update.mutate({ ...row, privileges });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="h-4 w-4" />
          Expected permissions matrix
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The drift check compares live database permissions against these rows.
          Changing a row changes what counts as drift.
        </p>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading matrix…</p>
        )}
        <div className="space-y-2">
          {(rows ?? []).map((row) => (
            <div
              key={`${row.table_name}:${row.grantee}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-[200px] flex-1">
                <p className="font-mono text-xs">{row.table_name}</p>
                <p className="text-xs text-muted-foreground">{row.grantee}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {PRIVILEGES.map((priv) => {
                  const on = row.privileges.includes(priv);
                  return (
                    <button
                      key={priv}
                      type="button"
                      onClick={() => toggle(row, priv)}
                      aria-pressed={on}
                      className={`rounded-full border px-2 py-0.5 text-[11px] tracking-wide transition ${
                        on
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {priv}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${row.table_name} ${row.grantee}`}
                onClick={() => remove.mutate(row)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="space-y-1">
            <Label htmlFor="grant-table" className="text-xs">
              Table
            </Label>
            <Input
              id="grant-table"
              value={newRow.table_name}
              placeholder="videos"
              onChange={(e) =>
                setNewRow({ ...newRow, table_name: e.target.value })
              }
              className="max-w-[220px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grant-role" className="text-xs">
              Role
            </Label>
            <Input
              id="grant-role"
              value={newRow.grantee}
              onChange={(e) => setNewRow({ ...newRow, grantee: e.target.value })}
              className="max-w-[180px]"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => add.mutate()}
            disabled={add.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add row
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const SecuritySettings = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "Security Settings | Reelo";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <Link
            to="/security/dashboard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to dashboard
          </Link>
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">
              Security · settings
            </p>
            <h1 className="font-serif text-3xl md:text-4xl">Tune the guards</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Email alerts, request limits and the expected permissions matrix —
              all editable here, all enforced by the database.
            </p>
          </div>
        </header>

        <SecurityAlertSettingsCard />
        <RateLimitsCard />
        <MatrixCard />
      </div>
    </div>
  );
};

export default SecuritySettings;
