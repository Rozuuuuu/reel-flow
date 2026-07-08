
-- Move DEFINER implementations into private schema
CREATE OR REPLACE FUNCTION private.security_matrix_access_check(_user_agent TEXT)
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
  PERFORM private.enforce_rate_limit('security_matrix_access', _uid, 60);
  _is_admin := private.has_role(_uid, 'admin');
  INSERT INTO public.security_access_log (user_id, path, was_admin, user_agent)
  VALUES (_uid, '/security/matrix', _is_admin, left(coalesce(_user_agent, ''), 500));
  RETURN _is_admin;
END;
$$;
REVOKE ALL ON FUNCTION private.security_matrix_access_check(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.has_role_rate_limited(_user_id UUID, _role app_role)
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
REVOKE ALL ON FUNCTION private.has_role_rate_limited(UUID, app_role) FROM PUBLIC;

-- Replace the public functions with SECURITY INVOKER wrappers
DROP FUNCTION IF EXISTS public.security_matrix_access_check(TEXT);
CREATE OR REPLACE FUNCTION public.security_matrix_access_check(_user_agent TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.security_matrix_access_check(_user_agent)
$$;
GRANT EXECUTE ON FUNCTION public.security_matrix_access_check(TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.has_role_rate_limited(UUID, app_role);
CREATE OR REPLACE FUNCTION public.has_role_rate_limited(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.has_role_rate_limited(_user_id, _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role_rate_limited(UUID, app_role) TO authenticated;
