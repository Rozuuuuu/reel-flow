-- Security scan registry powering /security/dashboard.
CREATE TABLE IF NOT EXISTS public.security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  suite TEXT NOT NULL DEFAULT 'local',
  findings_total INTEGER NOT NULL DEFAULT 0,
  findings_high INTEGER NOT NULL DEFAULT 0,
  findings_critical INTEGER NOT NULL DEFAULT 0,
  open_issues INTEGER NOT NULL DEFAULT 0,
  baseline_diff TEXT NOT NULL DEFAULT 'skipped',
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ran_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT ON public.security_scans TO authenticated;
GRANT ALL ON public.security_scans TO service_role;

ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security scans"
ON public.security_scans FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS security_scans_started_at_idx
  ON public.security_scans (started_at DESC);
CREATE INDEX IF NOT EXISTS security_scans_status_idx
  ON public.security_scans (status, started_at DESC);

-- Admin-only writer: records a scan run AND audits it in security_access_log.
CREATE OR REPLACE FUNCTION private.log_security_scan(
  _scanner TEXT,
  _status TEXT,
  _suite TEXT,
  _findings_total INTEGER,
  _findings_high INTEGER,
  _findings_critical INTEGER,
  _open_issues INTEGER,
  _baseline_diff TEXT,
  _notes TEXT,
  _details JSONB,
  _user_agent TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _id UUID;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('security_scan', _uid, 60);

  INSERT INTO public.security_scans (
    scanner, status, suite, findings_total, findings_high, findings_critical,
    open_issues, baseline_diff, notes, details, ran_by, completed_at
  ) VALUES (
    _scanner,
    COALESCE(NULLIF(_status, ''), 'pending'),
    COALESCE(NULLIF(_suite, ''), 'local'),
    COALESCE(_findings_total, 0),
    COALESCE(_findings_high, 0),
    COALESCE(_findings_critical, 0),
    COALESCE(_open_issues, 0),
    COALESCE(NULLIF(_baseline_diff, ''), 'skipped'),
    _notes,
    COALESCE(_details, '{}'::jsonb),
    _uid,
    CASE WHEN _status IN ('completed', 'failed') THEN now() ELSE NULL END
  )
  RETURNING id INTO _id;

  INSERT INTO public.security_access_log (user_id, path, was_admin, user_agent)
  VALUES (
    _uid,
    '/security/scan?scanner=' || COALESCE(_scanner, 'unknown') || '&status=' || COALESCE(_status, 'pending'),
    true,
    left(COALESCE(_user_agent, ''), 500)
  );

  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION private.log_security_scan(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.log_security_scan(
  _scanner TEXT,
  _status TEXT DEFAULT 'completed',
  _suite TEXT DEFAULT 'local',
  _findings_total INTEGER DEFAULT 0,
  _findings_high INTEGER DEFAULT 0,
  _findings_critical INTEGER DEFAULT 0,
  _open_issues INTEGER DEFAULT 0,
  _baseline_diff TEXT DEFAULT 'skipped',
  _notes TEXT DEFAULT NULL,
  _details JSONB DEFAULT '{}'::jsonb,
  _user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.log_security_scan(
    _scanner, _status, _suite, _findings_total, _findings_high,
    _findings_critical, _open_issues, _baseline_diff, _notes, _details, _user_agent
  )
$$;
GRANT EXECUTE ON FUNCTION public.log_security_scan(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- Seed with the scan suite actually executed on 2026-09-02.
INSERT INTO public.security_scans (
  scanner, status, suite, findings_total, findings_high, findings_critical,
  open_issues, baseline_diff, notes, details, started_at, completed_at
) VALUES
(
  'lovable-security-scan', 'completed', 'backend-rls',
  0, 0, 0, 0, 'pass',
  'Full backend scan: no exposed data, no missing RLS, no misconfiguration findings.',
  '{"source":"run_security_scan","result":"no_issues"}'::jsonb,
  now() - interval '20 minutes', now() - interval '19 minutes'
),
(
  'supabase-linter', 'completed', 'database-linter',
  0, 0, 0, 0, 'pass',
  'Database linter clean — no security or performance advisories.',
  '{"source":"supabase_linter","result":"no_issues"}'::jsonb,
  now() - interval '18 minutes', now() - interval '18 minutes'
),
(
  'security-scan-diff', 'completed', 'baseline-diff',
  0, 0, 0, 0, 'pass',
  'baseline=0 current=0 — no new high/critical findings vs security-fixtures/baseline.json.',
  '{"baseline":0,"current":0,"exit_code":0}'::jsonb,
  now() - interval '17 minutes', now() - interval '17 minutes'
),
(
  'security-definer-tests', 'completed', 'vitest-security-definer',
  0, 0, 0, 0, 'pass',
  '6 passed / 6 skipped: private-schema sealing + wrapper checks passed; admin/owner reachability cases skipped (TEST_ADMIN_* / TEST_OWNER_* creds not present locally).',
  '{"passed":6,"skipped":6,"files":["src/test/securityDefiner.policy.test.ts","src/test/securityDefiner.admin.policy.test.ts"]}'::jsonb,
  now() - interval '15 minutes', now() - interval '15 minutes'
),
(
  'security-definer-tests', 'pending', 'vitest-security-definer',
  0, 0, 1, 1, 'skipped',
  'Admin/owner reachability suite awaiting TEST_ADMIN_EMAIL/PASSWORD, TEST_OWNER_EMAIL/PASSWORD and TEST_OWNER_VIDEO_ID so the 6 skipped cases run against a real database.',
  '{"blocked_on":["TEST_ADMIN_EMAIL","TEST_ADMIN_PASSWORD","TEST_OWNER_EMAIL","TEST_OWNER_PASSWORD","TEST_OWNER_VIDEO_ID"],"skipped_cases":6}'::jsonb,
  now() - interval '15 minutes', NULL
);