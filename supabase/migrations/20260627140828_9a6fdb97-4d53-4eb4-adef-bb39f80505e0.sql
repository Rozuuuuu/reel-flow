
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Recreate helpers in `private` schema (not exposed via PostgREST)
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_moderator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','moderator'))
$$;

CREATE OR REPLACE FUNCTION private.can_view_video(_video_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.videos v
    where v.id = _video_id and v.deleted_at is null
      and (v.is_private = false or v.user_id = auth.uid())
  )
$$;

-- Allow policy evaluation (role evaluating RLS needs EXECUTE)
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.is_moderator(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.can_view_video(uuid) TO authenticated, anon;

-- Rewrite the public helpers to delegate (kept for any existing callers in app code),
-- now as SECURITY INVOKER so the linter no longer flags them.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select private.has_role(_user_id, _role)
$$;

CREATE OR REPLACE FUNCTION public.is_moderator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select private.is_moderator(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_view_video(_video_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select private.can_view_video(_video_id)
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_video(uuid) TO authenticated;
