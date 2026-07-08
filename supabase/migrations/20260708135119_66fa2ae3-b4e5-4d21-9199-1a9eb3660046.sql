
-- 1) security access log
CREATE TABLE public.security_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  was_admin BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_access_log_user_time ON public.security_access_log (user_id, created_at DESC);
CREATE INDEX idx_security_access_log_time ON public.security_access_log (created_at DESC);

GRANT SELECT ON public.security_access_log TO authenticated;
GRANT ALL ON public.security_access_log TO service_role;

ALTER TABLE public.security_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all security access logs"
  ON public.security_access_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies: writes only via SECURITY DEFINER function below.

-- 2) rate limits counter
CREATE TABLE public.rate_limits (
  bucket TEXT NOT NULL,
  user_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, user_id, window_start)
);
CREATE INDEX idx_rate_limits_window ON public.rate_limits (window_start);

GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read rate limits"
  ON public.rate_limits
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) private rate-limit helper
CREATE OR REPLACE FUNCTION private.enforce_rate_limit(
  _bucket TEXT,
  _user_id UUID,
  _limit_per_min INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window TIMESTAMPTZ := date_trunc('minute', now());
  _hits INT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'rate_limit: authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.rate_limits (bucket, user_id, window_start, hits)
  VALUES (_bucket, _user_id, _window, 1)
  ON CONFLICT (bucket, user_id, window_start)
  DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO _hits;

  IF _hits > _limit_per_min THEN
    RAISE EXCEPTION 'rate_limit_exceeded: bucket=% limit=%/min', _bucket, _limit_per_min
      USING ERRCODE = 'P0001';
  END IF;

  -- Opportunistic cleanup of stale windows (>1h old) — cheap and bounded.
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_rate_limit(TEXT, UUID, INT) FROM PUBLIC;

-- 4) public access-check RPC for /security/matrix
CREATE OR REPLACE FUNCTION public.security_matrix_access_check(_user_agent TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _is_admin BOOLEAN := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Enforce 60 hits/minute/user on this endpoint
  PERFORM private.enforce_rate_limit('security_matrix_access', _uid, 60);

  _is_admin := private.has_role(_uid, 'admin');

  INSERT INTO public.security_access_log (user_id, path, was_admin, user_agent)
  VALUES (_uid, '/security/matrix', _is_admin, left(coalesce(_user_agent, ''), 500));

  RETURN _is_admin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.security_matrix_access_check(TEXT) TO authenticated;

-- 5) rate-limited wrapper for has_role — used specifically by security surfaces
CREATE OR REPLACE FUNCTION public.has_role_rate_limited(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller UUID := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('has_role_rpc', _caller, 120);
  RETURN private.has_role(_user_id, _role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role_rate_limited(UUID, app_role) TO authenticated;
