
CREATE OR REPLACE FUNCTION private.log_security_export(_filters JSONB, _user_agent TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _is_admin BOOLEAN;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  _is_admin := private.has_role(_uid, 'admin');
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('security_export', _uid, 30);
  INSERT INTO public.security_access_log (user_id, path, was_admin, user_agent)
  VALUES (
    _uid,
    '/security/access-log/export?' || COALESCE(_filters::text, '{}'),
    true,
    left(COALESCE(_user_agent, ''), 500)
  );
END;
$$;
REVOKE ALL ON FUNCTION private.log_security_export(JSONB, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.log_security_export(
  _filters JSONB DEFAULT '{}'::jsonb,
  _user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.log_security_export(_filters, _user_agent)
$$;
GRANT EXECUTE ON FUNCTION public.log_security_export(JSONB, TEXT) TO authenticated;
