-- ============================================================
-- Enforce the security coverage matrix as real privileges.
-- Every public table previously had blanket ALL grants to anon
-- + authenticated. Revoke and re-grant least privilege matching
-- each table's RLS policy set.
-- ============================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- profiles: public read; owner insert/update; never delete
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- videos: public read of public rows; owner full control
GRANT SELECT ON public.videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;

-- comments: public read of visible rows; author write; moderator override
GRANT SELECT ON public.comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;

-- comment_edits: append-only history, owner/moderator read
GRANT SELECT, INSERT ON public.comment_edits TO authenticated;

-- comment_reports: reporter insert/read own; moderator review + delete
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_reports TO authenticated;

-- likes: public read; owner insert/delete (no update policy exists)
GRANT SELECT ON public.likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;

-- follows: public read; follower insert/delete
GRANT SELECT ON public.follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;

-- follow_requests: requester/target read; requester insert; target update; both delete
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_requests TO authenticated;

-- saved_videos: owner-only read/insert/delete
GRANT SELECT, INSERT, DELETE ON public.saved_videos TO authenticated;

-- notifications: recipient read/update/delete; inserts only via SECURITY DEFINER trigger
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

-- push_subscriptions: owner read/insert/delete
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;

-- user_roles: authenticated reads own row; admin-only writes enforced by restrictive policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- analytics_events: anyone may append their own event; self-read only
GRANT INSERT ON public.analytics_events TO anon;
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;

-- audit / ops tables: admin read only, writes go through SECURITY DEFINER helpers
GRANT SELECT ON public.rate_limits TO authenticated;
GRANT SELECT ON public.security_access_log TO authenticated;
GRANT SELECT ON public.security_scans TO authenticated;

-- service_role keeps full access for edge functions / admin tooling
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Future tables default to no client privileges (explicit grants required)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ============================================================
-- Drift detector: reports tables whose client privileges exceed
-- the matrix. Admin-only via the public wrapper.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matrix_expected_grants (
  table_name text NOT NULL,
  grantee text NOT NULL,
  privileges text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, grantee)
);

GRANT SELECT ON public.matrix_expected_grants TO authenticated;
GRANT ALL ON public.matrix_expected_grants TO service_role;
ALTER TABLE public.matrix_expected_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read expected grants" ON public.matrix_expected_grants;
CREATE POLICY "Admins can read expected grants"
ON public.matrix_expected_grants
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS matrix_expected_grants_set_updated_at ON public.matrix_expected_grants;
CREATE TRIGGER matrix_expected_grants_set_updated_at
BEFORE UPDATE ON public.matrix_expected_grants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.matrix_expected_grants (table_name, grantee, privileges) VALUES
  ('profiles','anon','{SELECT}'),
  ('profiles','authenticated','{SELECT,INSERT,UPDATE}'),
  ('videos','anon','{SELECT}'),
  ('videos','authenticated','{SELECT,INSERT,UPDATE,DELETE}'),
  ('comments','anon','{SELECT}'),
  ('comments','authenticated','{SELECT,INSERT,UPDATE,DELETE}'),
  ('comment_edits','authenticated','{SELECT,INSERT}'),
  ('comment_reports','authenticated','{SELECT,INSERT,UPDATE,DELETE}'),
  ('likes','anon','{SELECT}'),
  ('likes','authenticated','{SELECT,INSERT,DELETE}'),
  ('follows','anon','{SELECT}'),
  ('follows','authenticated','{SELECT,INSERT,DELETE}'),
  ('follow_requests','authenticated','{SELECT,INSERT,UPDATE,DELETE}'),
  ('saved_videos','authenticated','{SELECT,INSERT,DELETE}'),
  ('notifications','authenticated','{SELECT,UPDATE,DELETE}'),
  ('push_subscriptions','authenticated','{SELECT,INSERT,DELETE}'),
  ('user_roles','authenticated','{SELECT,INSERT,UPDATE,DELETE}'),
  ('analytics_events','anon','{INSERT}'),
  ('analytics_events','authenticated','{SELECT,INSERT}'),
  ('rate_limits','authenticated','{SELECT}'),
  ('security_access_log','authenticated','{SELECT}'),
  ('security_scans','authenticated','{SELECT}'),
  ('matrix_expected_grants','authenticated','{SELECT}')
ON CONFLICT (table_name, grantee) DO UPDATE SET privileges = EXCLUDED.privileges, updated_at = now();

CREATE OR REPLACE FUNCTION private.matrix_grant_drift()
RETURNS TABLE (table_name text, grantee text, expected text[], actual text[], status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actual AS (
    SELECT g.table_name::text AS table_name,
           g.grantee::text AS grantee,
           array_agg(DISTINCT g.privilege_type::text ORDER BY g.privilege_type::text) AS privs
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public' AND g.grantee IN ('anon','authenticated')
    GROUP BY 1,2
  ), expected AS (
    SELECT e.table_name, e.grantee,
           (SELECT array_agg(p ORDER BY p) FROM unnest(e.privileges) p) AS privs
    FROM public.matrix_expected_grants e
  )
  SELECT COALESCE(a.table_name, x.table_name),
         COALESCE(a.grantee, x.grantee),
         COALESCE(x.privs, '{}'::text[]),
         COALESCE(a.privs, '{}'::text[]),
         CASE
           WHEN x.privs IS NULL THEN 'unexpected_grant'
           WHEN a.privs IS NULL THEN 'missing_grant'
           WHEN a.privs = x.privs THEN 'ok'
           ELSE 'drift'
         END
  FROM actual a
  FULL OUTER JOIN expected x
    ON a.table_name = x.table_name AND a.grantee = x.grantee;
$$;

REVOKE ALL ON FUNCTION private.matrix_grant_drift() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.matrix_grant_drift()
RETURNS TABLE (table_name text, grantee text, expected text[], actual text[], status text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM private.matrix_grant_drift();
END;
$$;

REVOKE ALL ON FUNCTION public.matrix_grant_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matrix_grant_drift() TO authenticated;