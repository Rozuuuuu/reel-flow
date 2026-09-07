-- Ensure exactly one alert settings row exists
INSERT INTO public.security_alert_settings (recipients, notify_pending, notify_failed, notify_drift, pending_after_minutes, enabled)
SELECT '{}'::text[], true, true, true, 30, true
WHERE NOT EXISTS (SELECT 1 FROM public.security_alert_settings);

-- Record the expected privileges for the alert tables in the grant matrix
INSERT INTO public.matrix_expected_grants (table_name, grantee, privileges) VALUES
  ('security_alert_settings', 'authenticated', ARRAY['SELECT','INSERT','UPDATE']),
  ('security_alert_settings', 'service_role', ARRAY['SELECT','INSERT','UPDATE','DELETE']),
  ('security_alerts_sent', 'authenticated', ARRAY['SELECT']),
  ('security_alerts_sent', 'service_role', ARRAY['SELECT','INSERT','UPDATE','DELETE'])
ON CONFLICT (table_name, grantee) DO UPDATE SET privileges = EXCLUDED.privileges, updated_at = now();

-- Enforce them
REVOKE ALL ON public.security_alert_settings FROM anon, authenticated;
REVOKE ALL ON public.security_alerts_sent FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.security_alert_settings TO authenticated;
GRANT ALL ON public.security_alert_settings TO service_role;
GRANT SELECT ON public.security_alerts_sent TO authenticated;
GRANT ALL ON public.security_alerts_sent TO service_role;