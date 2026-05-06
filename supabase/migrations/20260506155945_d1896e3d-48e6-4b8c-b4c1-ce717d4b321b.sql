-- 1) Storage: drop broad public SELECT policies that allow listing.
-- Public buckets (videos/thumbnails/avatars) remain accessible via /object/public/ URLs.
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public read videos" ON storage.objects;

-- 2) SECURITY DEFINER trigger functions: revoke EXECUTE from public/authenticated.
-- These are only meant to run from triggers, never called directly by clients.
REVOKE EXECUTE ON FUNCTION public.handle_comment_reply_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_follow_request_response() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;