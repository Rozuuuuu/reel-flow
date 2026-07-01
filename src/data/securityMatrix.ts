/**
 * Table ↔ RLS policy ↔ SECURITY DEFINER helper map.
 *
 * Source of truth for the /security/matrix page. Update whenever a table,
 * policy, or wrapper changes so the docs stay honest.
 *
 * `wrappers` lists the *public* SECURITY INVOKER wrappers a policy calls;
 * `definers` lists the underlying `private.*` SECURITY DEFINER helpers that
 * do the actual privileged work. The Data API only exposes the `public`
 * schema — `private.*` is never directly reachable by clients.
 */

export interface MatrixRow {
  resource: string;
  kind: "table" | "storage" | "realtime";
  policy: string;
  /** Public wrappers referenced by this resource's policies. */
  wrappers: string[];
  /** private.* SECURITY DEFINER helpers backing those wrappers. */
  definers: string[];
  notes?: string;
}

export const MATRIX_ROWS: MatrixRow[] = [
  {
    resource: "profiles",
    kind: "table",
    policy: "Public read; owner insert/update (auth.uid() = id)",
    wrappers: [],
    definers: [],
  },
  {
    resource: "videos",
    kind: "table",
    policy: "Public read when is_private=false AND deleted_at IS NULL; owner all",
    wrappers: ["public.can_view_video"],
    definers: ["private.can_view_video"],
  },
  {
    resource: "comments",
    kind: "table",
    policy: "Public read visible rows; author write; moderator override",
    wrappers: ["public.is_moderator"],
    definers: ["private.is_moderator", "private.has_role"],
  },
  {
    resource: "comment_edits",
    kind: "table",
    policy: "Author + moderator read; automatic insert on comment edit",
    wrappers: ["public.is_moderator"],
    definers: ["private.is_moderator"],
  },
  {
    resource: "comment_reports",
    kind: "table",
    policy: "Reporter reads own; moderators read all; auth insert",
    wrappers: ["public.is_moderator"],
    definers: ["private.is_moderator"],
  },
  {
    resource: "likes",
    kind: "table",
    policy: "Public read; owner write",
    wrappers: [],
    definers: [],
  },
  {
    resource: "follows",
    kind: "table",
    policy: "Public read; follower writes their own row",
    wrappers: [],
    definers: [],
  },
  {
    resource: "follow_requests",
    kind: "table",
    policy: "Requester + target read; requester insert; target updates status",
    wrappers: [],
    definers: [],
    notes: "handle_follow_request_response trigger promotes accepted requests into follows.",
  },
  {
    resource: "saved_videos",
    kind: "table",
    policy: "Owner-only read/write (auth.uid() = user_id)",
    wrappers: [],
    definers: [],
  },
  {
    resource: "notifications",
    kind: "table",
    policy: "Recipient-only read; recipient marks as read",
    wrappers: [],
    definers: [],
    notes: "handle_comment_reply_notification trigger writes rows as SECURITY DEFINER.",
  },
  {
    resource: "push_subscriptions",
    kind: "table",
    policy: "Owner-only (auth.uid() = user_id)",
    wrappers: [],
    definers: [],
  },
  {
    resource: "user_roles",
    kind: "table",
    policy: "Restrictive: authenticated read own row; admin-only write",
    wrappers: ["public.has_role"],
    definers: ["private.has_role"],
    notes: "Roles live here, never on profiles. Prevents privilege-escalation via profile update.",
  },
  {
    resource: "analytics_events",
    kind: "table",
    policy: "Self-read only; anyone may insert their own event",
    wrappers: [],
    definers: [],
  },
  {
    resource: "bucket:videos",
    kind: "storage",
    policy: "Public read; owner path-segment write (first path segment = auth.uid())",
    wrappers: [],
    definers: [],
  },
  {
    resource: "bucket:thumbnails",
    kind: "storage",
    policy: "Public read; owner path-segment write",
    wrappers: [],
    definers: [],
  },
  {
    resource: "bucket:avatars",
    kind: "storage",
    policy: "Public read; owner path-segment write",
    wrappers: [],
    definers: [],
  },
  {
    resource: "realtime:notifications:<uid>",
    kind: "realtime",
    policy: "Topic uid segment must equal auth.uid()",
    wrappers: [],
    definers: [],
  },
  {
    resource: "realtime:comments:<video_id>",
    kind: "realtime",
    policy: "Authenticated AND public.can_view_video(video_id)",
    wrappers: ["public.can_view_video"],
    definers: ["private.can_view_video"],
  },
];

export const WRAPPER_INDEX: {
  wrapper: string;
  definer: string;
  security: "INVOKER" | "DEFINER";
  purpose: string;
}[] = [
  {
    wrapper: "public.has_role(_user_id, _role)",
    definer: "private.has_role(_user_id, _role)",
    security: "INVOKER",
    purpose: "Role check used by user_roles + moderator gating. Never returns true for anon.",
  },
  {
    wrapper: "public.is_moderator(_user_id)",
    definer: "private.is_moderator(_user_id)",
    security: "INVOKER",
    purpose: "Combines admin + moderator roles. Backs comment moderation policies.",
  },
  {
    wrapper: "public.can_view_video(_video_id)",
    definer: "private.can_view_video(_video_id)",
    security: "INVOKER",
    purpose: "Visibility check used by video RLS + realtime:comments topic auth.",
  },
];
