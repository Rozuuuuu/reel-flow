GRANT EXECUTE ON FUNCTION public.log_security_scan(text, text, text, integer, integer, integer, integer, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_drift_scan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_security_scan(uuid, text, integer, integer, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.matrix_grant_drift() TO authenticated;