import { supabase } from "@/integrations/supabase/client";

/**
 * Recognized analytics event names. Adding new events here is intentional —
 * keeping the union narrow makes it easy to query and dashboard.
 */
export type AnalyticsEventName =
  | "share_open"
  | "share_native_success"
  | "share_native_aborted"
  | "share_copy_success"
  | "share_fallback_open"
  | "share_fallback_copy_success"
  | "share_fallback_copy_failed"
  | "deep_link_opened"
  | "deep_link_state_shown"
  | "follow_request_sent"
  | "comment_open"
  | "comment_create"
  | "comment_report"
  | "comment_edit"
  | "comment_hide";

const SESSION_KEY = "reelo:session-id";

const getSessionId = (): string => {
  if (typeof window === "undefined") return "ssr";
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)) + "-" + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "no-storage";
  }
};

interface TrackOptions {
  /** Optional — defaults to the currently signed-in user (or null for anon). */
  userId?: string | null;
  /** Arbitrary structured context. Keep it small. */
  props?: Record<string, unknown>;
}

/**
 * Fire-and-forget event recorder. Never throws — analytics must not break UX.
 * Returns true on success for tests.
 */
export const trackEvent = async (
  name: AnalyticsEventName,
  options: TrackOptions = {},
): Promise<boolean> => {
  try {
    let userId = options.userId ?? null;
    if (userId === undefined || userId === null) {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id ?? null;
    }

    const payload = {
      user_id: userId,
      session_id: getSessionId(),
      event_name: name,
      props: {
        ...(options.props ?? {}),
        path:
          typeof window !== "undefined" ? window.location.pathname : undefined,
        ts_client: new Date().toISOString(),
      },
    };

    const { error } = await supabase.from("analytics_events").insert(payload);
    if (error) {
      // Dev-only visibility; never alert the user.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[analytics] insert failed:", error.message, payload);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[analytics] threw:", err);
    }
    return false;
  }
};
