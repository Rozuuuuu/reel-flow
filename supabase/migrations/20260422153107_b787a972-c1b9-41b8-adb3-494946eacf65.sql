-- =========================================================
-- 1. follow_requests
-- =========================================================
CREATE TYPE public.follow_request_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE public.follow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  target_id uuid NOT NULL,
  status public.follow_request_status NOT NULL DEFAULT 'pending',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT follow_requests_no_self CHECK (requester_id <> target_id)
);

-- One active request per (requester, target). Re-requesting after a decision
-- requires deleting the old row first (handled in app code).
CREATE UNIQUE INDEX follow_requests_unique_pair
  ON public.follow_requests (requester_id, target_id);

CREATE INDEX follow_requests_target_status_idx
  ON public.follow_requests (target_id, status);

ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

-- Read: requester sees their outgoing, target sees their incoming
CREATE POLICY "Requester can view own outgoing requests"
ON public.follow_requests
FOR SELECT
USING (auth.uid() = requester_id);

CREATE POLICY "Target can view own incoming requests"
ON public.follow_requests
FOR SELECT
USING (auth.uid() = target_id);

-- Insert: signed-in user creates a pending request as themselves
CREATE POLICY "Users can create their own follow requests"
ON public.follow_requests
FOR INSERT
WITH CHECK (
  auth.uid() = requester_id
  AND requester_id <> target_id
  AND status = 'pending'
);

-- Update: target can accept/decline; requester can cancel by deleting (below)
CREATE POLICY "Target can respond to own requests"
ON public.follow_requests
FOR UPDATE
USING (auth.uid() = target_id)
WITH CHECK (auth.uid() = target_id);

-- Delete: either side can withdraw/clear
CREATE POLICY "Either party can delete a request"
ON public.follow_requests
FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Trigger: when accepted, materialize the follow row + stamp responded_at
CREATE OR REPLACE FUNCTION public.handle_follow_request_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.responded_at := now();
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.follows (follower_id, following_id)
      VALUES (NEW.requester_id, NEW.target_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_follow_request_status_change
BEFORE UPDATE ON public.follow_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_follow_request_response();

-- =========================================================
-- 2. analytics_events
-- =========================================================
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,            -- nullable so anonymous visitors can also record
  session_id text,         -- client-generated stable id for anon users
  event_name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_name_created_idx
  ON public.analytics_events (event_name, created_at DESC);

CREATE INDEX analytics_events_user_idx
  ON public.analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can insert their own event.
-- - Signed-in: user_id must equal auth.uid() (or be null)
-- - Anon: user_id must be null
CREATE POLICY "Anyone can record their own analytics events"
ON public.analytics_events
FOR INSERT
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()))
);

-- Only the recorder can read their own events back. No public read.
CREATE POLICY "Users can read their own events"
ON public.analytics_events
FOR SELECT
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());