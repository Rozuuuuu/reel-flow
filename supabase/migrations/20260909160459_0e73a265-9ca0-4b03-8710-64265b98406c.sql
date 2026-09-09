-- Guard the drift reader itself so direct execution is admin-only too.
CREATE OR REPLACE FUNCTION private.matrix_grant_drift()
RETURNS TABLE(table_name text, grantee text, expected text[], actual text[], status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT private.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.table_name,
         e.grantee,
         e.privileges AS expected,
         COALESCE(a.privs, '{}'::text[]) AS actual,
         CASE
           WHEN COALESCE(a.privs, '{}'::text[]) @> e.privileges
            AND e.privileges @> COALESCE(a.privs, '{}'::text[]) THEN 'ok'
           WHEN COALESCE(a.privs, '{}'::text[]) = '{}'::text[] THEN 'missing'
           WHEN NOT (e.privileges @> COALESCE(a.privs, '{}'::text[])) THEN 'excess'
           ELSE 'partial'
         END AS status
  FROM public.matrix_expected_grants e
  LEFT JOIN (
    SELECT tp.table_name::text AS table_name,
           tp.grantee::text AS grantee,
           array_agg(DISTINCT tp.privilege_type::text ORDER BY tp.privilege_type::text) AS privs
    FROM information_schema.table_privileges tp
    WHERE tp.table_schema = 'public'
    GROUP BY 1, 2
  ) a ON a.table_name = e.table_name AND a.grantee = e.grantee
  ORDER BY e.table_name, e.grantee;
END;
$function$;

GRANT EXECUTE ON FUNCTION private.log_security_scan(text, text, text, integer, integer, integer, integer, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.complete_security_scan(uuid, text, integer, integer, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.run_drift_scan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.matrix_grant_drift() TO authenticated;
GRANT EXECUTE ON FUNCTION private.log_security_export(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.security_matrix_access_check(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role_rate_limited(uuid, app_role) TO authenticated;