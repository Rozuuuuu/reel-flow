/**
 * Public-facing security & RLS policy documentation.
 * Linked from the More panel. Kept in code (not markdown) so it deploys with
 * the app and stays version-controlled alongside the migrations it describes.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";

interface Row {
  table: string;
  read: string;
  write: string;
  adminBypass: string;
}

const tables: Row[] = [
  {
    table: "profiles",
    read: "Public — anyone can read every profile.",
    write: "Only the owning user may insert or update their own row (auth.uid() = id).",
    adminBypass: "No — admins follow the same rule.",
  },
  {
    table: "videos",
    read: "Public videos (is_private = false, deleted_at IS NULL) are world-readable. Owners always see their own.",
    write: "Only the owning user (auth.uid() = user_id) may insert, update, or delete.",
    adminBypass: "No — admins cannot edit other users' videos via the Data API.",
  },
  {
    table: "comments",
    read: "Visible comments are public. Hidden comments are visible only to the author and moderators.",
    write: "Author may insert/update/delete their own. Moderators may update or delete any comment.",
    adminBypass: "Yes — moderators and admins can hide or delete any comment.",
  },
  {
    table: "comment_edits",
    read: "Restricted to the original comment's author and to moderators. Not publicly readable.",
    write: "Inserted automatically when the author edits their own comment, or by a moderator on their own edits.",
    adminBypass: "Moderators can read all edit history.",
  },
  {
    table: "comment_reports",
    read: "Reporter sees their own reports. Moderators see all.",
    write: "Any authenticated user may file a report on their own behalf. Moderators may update/delete reports.",
    adminBypass: "Yes — moderators handle the moderation queue.",
  },
  {
    table: "likes",
    read: "Public — like counts and likers are world-readable.",
    write: "User may like/unlike on their own behalf.",
    adminBypass: "No.",
  },
  {
    table: "follows / follow_requests",
    read: "Follows are public. Follow requests are visible only to requester and target.",
    write: "User may create their own follow/request. Target may respond to incoming requests. Either party may cancel.",
    adminBypass: "No.",
  },
  {
    table: "saved_videos",
    read: "Only the owning user can read their saved list.",
    write: "Only the owning user can save or unsave.",
    adminBypass: "No.",
  },
  {
    table: "notifications",
    read: "Only the recipient can read.",
    write: "Created by database triggers (e.g. comment-reply). Only the recipient may mark read or delete.",
    adminBypass: "No — admins cannot read other users' notifications via the API.",
  },
  {
    table: "push_subscriptions",
    read: "Only the owning user can read.",
    write: "Only the owning user can register or revoke a subscription.",
    adminBypass: "Service role only (used by the send-push edge function).",
  },
  {
    table: "user_roles",
    read: "User can read their own role(s). Admins can read all.",
    write: "Restricted by a RESTRICTIVE policy: only admins (has_role(auth.uid(), 'admin')) may insert, update, or delete rows. No self-promotion is possible.",
    adminBypass: "Yes — admins manage all role assignments.",
  },
  {
    table: "analytics_events",
    read: "Only the originating user can read their own events.",
    write: "Anyone (including guests) may insert their own event row.",
    adminBypass: "Service role only.",
  },
];

const storageRules = [
  ["videos", "Public read (CDN). Owner-only insert/update/delete based on the first path segment matching auth.uid()."],
  ["thumbnails", "Public read. Owner-only insert/update/delete (path segment = auth.uid())."],
  ["avatars", "Public read. Owner-only insert/update/delete (path segment = auth.uid())."],
];

const realtimeRules = [
  [
    "notifications:<user_id>:<rand>",
    "Only the user matching <user_id> may subscribe (enforced by an RLS policy on realtime.messages comparing the topic to auth.uid()).",
  ],
  [
    "comments:<video_id>",
    "Only authenticated users may subscribe, and only when can_view_video(<video_id>) returns true (video is public or owned by the user).",
  ],
];

const SecurityPolicy = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "Security & RLS Policy | Reelo";
    return () => { document.title = prev; };
  }, []);
  return (
  <div className="min-h-screen bg-background px-4 py-10 md:px-10">


    <article className="mx-auto max-w-4xl space-y-10 text-foreground">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          Trust & safety
        </p>
        <h1 className="font-serif text-4xl md:text-5xl">
          Security &amp; RLS policy
        </h1>
        <p className="text-muted-foreground">
          Every database table, storage bucket, and realtime channel in Reelo is
          governed by Postgres Row Level Security. This page documents who can
          read and write each one, and when (if ever) admins bypass the rule.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Principles</h2>
        <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
          <li>
            Default-deny: every table has RLS enabled. Policies grant the
            minimum access required.
          </li>
          <li>
            Roles live in <code>user_roles</code>, never on{" "}
            <code>profiles</code>. Self-promotion is impossible because a
            <em> restrictive </em> policy requires admin to write.
          </li>
          <li>
            Admin / moderator bypass is explicit: it only exists where called
            out below, and it is implemented via the security-definer
            <code> has_role</code> / <code>is_moderator</code> functions.
          </li>
          <li>
            Storage object ownership is determined by the first path segment of
            the object name (the user's id).
          </li>
          <li>
            Realtime channel subscriptions are authorized by an RLS policy on{" "}
            <code>realtime.messages</code>; the topic name itself is matched
            against <code>auth.uid()</code> or against video visibility.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Table-by-table rules</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Read</th>
                <th className="px-4 py-3">Write</th>
                <th className="px-4 py-3">Admin bypass</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((row) => (
                <tr key={row.table} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-mono text-xs">{row.table}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.read}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.write}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.adminBypass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Storage buckets</h2>
        <ul className="space-y-2 text-sm">
          {storageRules.map(([name, rule]) => (
            <li key={name} className="rounded-md border border-border px-4 py-3">
              <span className="font-mono text-xs">{name}</span>
              <span className="block text-muted-foreground">{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Realtime channels</h2>
        <ul className="space-y-2 text-sm">
          {realtimeRules.map(([topic, rule]) => (
            <li key={topic} className="rounded-md border border-border px-4 py-3">
              <span className="font-mono text-xs">{topic}</span>
              <span className="block text-muted-foreground">{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl">How this is verified</h2>
        <p className="text-sm text-muted-foreground">
          Live status, per-resource test mapping, and recent PR pass/fail
          history live on the{" "}
          <Link to="/security/coverage" className="underline">
            security coverage dashboard
          </Link>
          .
        </p>
        <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
          <li>
            Continuous scans by the Lovable security scanner (Supabase
            posture), Wiz, and the connector security scanner — surfaced in
            the project Security tab.
          </li>
          <li>
            Vitest RLS smoke tests (<code>src/test/rls.policy.test.ts</code>)
            run on every CI build to assert that anonymous clients cannot read
            or write protected tables and storage buckets.
          </li>
          <li>
            <code>bun audit</code> in CI fails the build on high or critical
            dependency vulnerabilities.
          </li>
        </ul>
      </section>

      <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
        <Link to="/" className="underline">
          ← Back to the feed
        </Link>
      </footer>
    </article>
  </div>
  );
};

export default SecurityPolicy;
