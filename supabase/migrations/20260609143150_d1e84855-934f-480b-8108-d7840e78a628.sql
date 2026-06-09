
-- 1. comment_edits: restrict SELECT to owner + moderators
DROP POLICY IF EXISTS "Edit history viewable by everyone" ON public.comment_edits;
CREATE POLICY "Owners and moderators can view edit history"
  ON public.comment_edits
  FOR SELECT
  TO authenticated
  USING (
    public.is_moderator(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.id = comment_edits.comment_id
        AND c.user_id = auth.uid()
    )
  );

-- 2. user_roles: restrict SELECT to self or admins
DROP POLICY IF EXISTS "Roles are viewable by everyone" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Storage UPDATE policies for videos and thumbnails
DROP POLICY IF EXISTS "Users update own videos" ON storage.objects;
CREATE POLICY "Users update own videos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'videos' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'videos' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own thumbnails" ON storage.objects;
CREATE POLICY "Users update own thumbnails"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'thumbnails' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'thumbnails' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4. Realtime channel authorization
-- Topic conventions used in this app:
--   notifications:<user_id>:<rand>   -- only owning user may subscribe
--   comments:<video_id>              -- any authenticated user may subscribe
DROP POLICY IF EXISTS "Users can subscribe to their own notifications topic" ON realtime.messages;
CREATE POLICY "Users can subscribe to their own notifications topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (realtime.topic() LIKE 'notifications:' || auth.uid()::text || ':%')
    OR (realtime.topic() LIKE 'comments:%')
  );
