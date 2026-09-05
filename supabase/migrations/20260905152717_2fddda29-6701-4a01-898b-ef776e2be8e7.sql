-- Storage matrix rows: public read, owner-only writes scoped by first path segment.
DROP POLICY IF EXISTS "Users upload own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users update own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Users update own thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public read media buckets" ON storage.objects;

CREATE POLICY "Public read media buckets"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id IN ('videos','thumbnails','avatars'));

CREATE POLICY "Owner upload media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('videos','thumbnails','avatars')
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner update media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('videos','thumbnails','avatars')
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id IN ('videos','thumbnails','avatars')
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner delete media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('videos','thumbnails','avatars')
  AND (auth.uid())::text = (storage.foldername(name))[1]
);