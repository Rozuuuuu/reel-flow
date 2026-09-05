-- Alert settings (single row, admin managed)
CREATE TABLE IF NOT EXISTS public.security_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipients text[] NOT NULL DEFAULT '{}',
  notify_pending boolean NOT NULL DEFAULT true,
  notify_failed boolean NOT NULL DEFAULT true,
  notify_drift boolean NOT NULL DEFAULT true,
  pending_after_minutes integer NOT NULL DEFAULT 30,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.security_alert_settings TO authenticated;
GRANT ALL ON public.security_alert_settings TO service_role;
ALTER TABLE public.security_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read alert settings" ON public.security_alert_settings
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert alert settings" ON public.security_alert_settings
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update alert settings" ON public.security_alert_settings
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER security_alert_settings_set_updated_at
BEFORE UPDATE ON public.security_alert_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.security_alert_settings (recipients) VALUES ('{}');

-- Sent-alert history (dedupe + audit). Writes only via service_role.
CREATE TABLE IF NOT EXISTS public.security_alerts_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES public.security_scans(id) ON DELETE CASCADE,
  kind text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS security_alerts_sent_scan_kind_key
  ON public.security_alerts_sent (scan_id, kind) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_alerts_sent_created_at_idx
  ON public.security_alerts_sent (created_at DESC);

GRANT SELECT ON public.security_alerts_sent TO authenticated;
GRANT ALL ON public.security_alerts_sent TO service_role;
ALTER TABLE public.security_alerts_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sent alerts" ON public.security_alerts_sent
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Keep the drift expectations in sync with the new tables
INSERT INTO public.matrix_expected_grants (table_name, grantee, privileges) VALUES
  ('security_alert_settings','authenticated','{SELECT,INSERT,UPDATE}'),
  ('security_alerts_sent','authenticated','{SELECT}')
ON CONFLICT (table_name, grantee) DO UPDATE SET privileges = EXCLUDED.privileges, updated_at = now();