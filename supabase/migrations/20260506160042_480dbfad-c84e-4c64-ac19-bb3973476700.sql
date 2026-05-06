REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_moderator(uuid) FROM authenticated, PUBLIC;