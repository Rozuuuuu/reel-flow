
-- Enhance enforce_rate_limit to attach retry_after seconds in the exception HINT,
-- so clients (Supabase JS surfaces this as error.hint) can compute an accurate
-- countdown without guessing the window boundary.
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
  _retry_after INT;
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
    _retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((_window + interval '1 minute') - now())))::INT);
    RAISE EXCEPTION 'rate_limit_exceeded: bucket=% limit=%/min retry_after=%s',
      _bucket, _limit_per_min, _retry_after
      USING ERRCODE = 'P0001',
            HINT = 'retry_after=' || _retry_after;
  END IF;

  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_rate_limit(TEXT, UUID, INT) FROM PUBLIC;

-- Composite indexes to keep /security/access-log filters fast at scale.
CREATE INDEX IF NOT EXISTS idx_security_access_log_admin_time
  ON public.security_access_log (was_admin, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_access_log_user_admin_time
  ON public.security_access_log (user_id, was_admin, created_at DESC);
