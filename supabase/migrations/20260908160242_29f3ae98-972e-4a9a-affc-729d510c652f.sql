-- 1. Tunable rate-limit thresholds
CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  bucket TEXT PRIMARY KEY,
  limit_per_min INTEGER NOT NULL CHECK (limit_per_min > 0),
  description TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_rate_limits TO authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read rate limit settings" ON public.security_rate_limits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write rate limit settings" ON public.security_rate_limits
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update rate limit settings" ON public.security_rate_limits
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete rate limit settings" ON public.security_rate_limits
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER security_rate_limits_set_updated_at
  BEFORE UPDATE ON public.security_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.security_rate_limits (bucket, limit_per_min, description) VALUES
  ('has_role_rpc', 120, 'Role checks via the rate-limited has_role wrapper'),
  ('security_matrix_access', 60, 'Access checks for /security/matrix'),
  ('security_scan', 60, 'Recording scan runs from the dashboard'),
  ('security_export', 30, 'CSV exports from the security access log')
ON CONFLICT (bucket) DO NOTHING;

-- 2. Rate limiter reads the configured threshold
CREATE OR REPLACE FUNCTION private.enforce_rate_limit(_bucket text, _user_id uuid, _limit_per_min integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _window TIMESTAMPTZ := date_trunc('minute', now());
  _hits INT;
  _retry_after INT;
  _limit INT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'rate_limit: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT limit_per_min INTO _limit
  FROM public.security_rate_limits WHERE bucket = _bucket;
  _limit := COALESCE(_limit, _limit_per_min);

  INSERT INTO public.rate_limits (bucket, user_id, window_start, hits)
  VALUES (_bucket, _user_id, _window, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO _hits;

  IF _hits > _limit THEN
    _retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((_window + interval '1 minute') - now())))::INT);
    RAISE EXCEPTION 'rate_limit_exceeded: bucket=% limit=%/min retry_after=%s',
      _bucket, _limit, _retry_after
      USING ERRCODE = 'P0001',
            HINT = 'retry_after=' || _retry_after;
  END IF;

  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
END;
$function$;

-- 3. Admins may edit the expected-grant matrix
CREATE POLICY "Admins insert expected grants" ON public.matrix_expected_grants
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update expected grants" ON public.matrix_expected_grants
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete expected grants" ON public.matrix_expected_grants
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matrix_expected_grants TO authenticated;

-- 4. Finish a queued scan
CREATE OR REPLACE FUNCTION private.complete_security_scan(
  _scan_id uuid, _status text, _findings_total integer, _findings_high integer,
  _findings_critical integer, _open_issues integer, _baseline_diff text, _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('security_scan', _uid, 60);

  UPDATE public.security_scans SET
    status = COALESCE(NULLIF(_status, ''), 'completed'),
    findings_total = COALESCE(_findings_total, findings_total),
    findings_high = COALESCE(_findings_high, findings_high),
    findings_critical = COALESCE(_findings_critical, findings_critical),
    open_issues = COALESCE(_open_issues, open_issues),
    baseline_diff = COALESCE(NULLIF(_baseline_diff, ''), baseline_diff),
    notes = COALESCE(_notes, notes),
    completed_at = now()
  WHERE id = _scan_id;

  INSERT INTO public.security_access_log (user_id, path, was_admin, user_agent)
  VALUES (_uid, '/security/scan/complete?id=' || _scan_id::text, true, '');

  RETURN _scan_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_security_scan(
  _scan_id uuid, _status text DEFAULT 'completed', _findings_total integer DEFAULT NULL,
  _findings_high integer DEFAULT NULL, _findings_critical integer DEFAULT NULL,
  _open_issues integer DEFAULT NULL, _baseline_diff text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  SELECT private.complete_security_scan(_scan_id, _status, _findings_total, _findings_high,
    _findings_critical, _open_issues, _baseline_diff, _notes)
$function$;

-- 5. Permission drift check that records its own run
CREATE OR REPLACE FUNCTION private.run_drift_scan(_user_agent text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _drift INT;
  _rows JSONB;
  _id UUID;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('security_scan', _uid, 60);

  SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb),
         COUNT(*) FILTER (WHERE d.status <> 'ok')
    INTO _rows, _drift
  FROM private.matrix_grant_drift() d;

  INSERT INTO public.security_scans (
    scanner, status, suite, findings_total, findings_high, findings_critical,
    open_issues, baseline_diff, notes, details, ran_by, completed_at
  ) VALUES (
    'grant-drift-check',
    CASE WHEN _drift > 0 THEN 'failed' ELSE 'completed' END,
    'database',
    _drift, _drift, 0, _drift,
    CASE WHEN _drift > 0 THEN 'regressed' ELSE 'passed' END,
    CASE WHEN _drift > 0
      THEN _drift || ' table/role grant mismatch(es) against the expected matrix.'
      ELSE 'All table grants match the expected security matrix.' END,
    jsonb_build_object('drift', _rows),
    _uid, now()
  ) RETURNING id INTO _id;

  INSERT INTO public.security_access_log (user_id, path, was_admin, user_agent)
  VALUES (_uid, '/security/scan?scanner=grant-drift-check', true, left(COALESCE(_user_agent, ''), 500));

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_drift_scan(_user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  SELECT private.run_drift_scan(_user_agent)
$function$;

REVOKE EXECUTE ON FUNCTION private.enforce_rate_limit(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.complete_security_scan(uuid, text, integer, integer, integer, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.run_drift_scan(text) FROM PUBLIC;

-- 6. Register new tables in the expected matrix
INSERT INTO public.matrix_expected_grants (table_name, grantee, privileges) VALUES
  ('security_rate_limits', 'authenticated', ARRAY['SELECT','INSERT','UPDATE','DELETE']),
  ('security_alert_settings', 'authenticated', ARRAY['SELECT','INSERT','UPDATE']),
  ('security_alerts_sent', 'authenticated', ARRAY['SELECT'])
ON CONFLICT (table_name, grantee) DO UPDATE SET privileges = EXCLUDED.privileges;
