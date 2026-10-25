-- Per-viewer interests used by the AI reel-recommendation feature.
CREATE TABLE IF NOT EXISTS public.viewer_interests (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  interests text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viewer_interests TO authenticated;
GRANT ALL ON public.viewer_interests TO service_role;

ALTER TABLE public.viewer_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own interests"
  ON public.viewer_interests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interests"
  ON public.viewer_interests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interests"
  ON public.viewer_interests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interests"
  ON public.viewer_interests FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);