
-- Revoke direct EXECUTE on SECURITY DEFINER functions that should only run via triggers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_comment_reply_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_follow_request_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Tighten helpers: remove PUBLIC/anon, keep authenticated (needed inside RLS policies)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_moderator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_video(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_video(uuid) TO authenticated;
