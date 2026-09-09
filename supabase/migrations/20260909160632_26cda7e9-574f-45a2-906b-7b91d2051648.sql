UPDATE public.matrix_expected_grants
SET privileges = ARRAY['SELECT','INSERT','UPDATE','DELETE']
WHERE table_name = 'matrix_expected_grants' AND grantee = 'authenticated';

UPDATE public.matrix_expected_grants
SET privileges = ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','TRUNCATE']
WHERE table_name IN ('security_alert_settings','security_alerts_sent')
  AND grantee = 'service_role';