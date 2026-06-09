
-- 1. Explicit RESTRICTIVE write protection on user_roles.
-- Combined with the existing PERMISSIVE admin policy, only admins can write.
DROP POLICY IF EXISTS "Only admins can write roles (restrictive)" ON public.user_roles;
CREATE POLICY "Only admins can write roles (restrictive)"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Re-create a SELECT permissive policy alongside the restrictive write rule.
-- (The RESTRICTIVE FOR ALL above would also block self-SELECT; we relax that for SELECT only.)
DROP POLICY IF EXISTS "Only admins can write roles (restrictive)" ON public.user_roles;
CREATE POLICY "Only admins can mutate roles (restrictive)"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO public
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles (restrictive)"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO public
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles (restrictive)"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Helper for realtime comments topic auth: can the current user see this video?
CREATE OR REPLACE FUNCTION public.can_view_video(_video_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.videos v
    WHERE v.id = _video_id
      AND v.deleted_at IS NULL
      AND (v.is_private = false OR v.user_id = auth.uid())
  );
$$;

-- 3. Replace the broad realtime policy with per-topic shape + ownership checks.
DROP POLICY IF EXISTS "Users can subscribe to their own notifications topic" ON realtime.messages;

CREATE POLICY "Users can subscribe to their own notifications topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'notifications:' || auth.uid()::text || ':%'
  );

CREATE POLICY "Authenticated users can subscribe to visible video comment topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^comments:[0-9a-fA-F-]{36}$'
    AND public.can_view_video(
      substring(realtime.topic() FROM 'comments:([0-9a-fA-F-]{36})')::uuid
    )
  );
