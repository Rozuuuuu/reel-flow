ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Replace the permissive SELECT policy with one that hides private/deleted from non-owners
DROP POLICY IF EXISTS "Videos are viewable by everyone" ON public.videos;

CREATE POLICY "Public videos are viewable by everyone"
ON public.videos
FOR SELECT
USING (
  deleted_at IS NULL AND is_private = false
);

CREATE POLICY "Owners can view their own videos"
ON public.videos
FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS videos_visibility_idx
  ON public.videos (created_at DESC)
  WHERE deleted_at IS NULL AND is_private = false;