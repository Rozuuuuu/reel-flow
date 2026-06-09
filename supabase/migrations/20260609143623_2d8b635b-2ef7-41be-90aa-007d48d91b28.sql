
REVOKE EXECUTE ON FUNCTION public.can_view_video(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_video(uuid) TO service_role;
