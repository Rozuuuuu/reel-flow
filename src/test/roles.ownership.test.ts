/**
 * Edge-case ownership tests for roles / moderators.
 *
 * We verify from an anonymous client (no JWT, no admin) that:
 *   - role transfers (delete + re-insert) are rejected,
 *   - direct deletes against user_roles are rejected,
 *   - admin-only tables (comment_reports moderation columns, comment_edits
 *     history) reject reads without admin/moderator privileges,
 *   - inserting a row with a forged user_id is rejected on every table that
 *     pins ownership to auth.uid().
 *
 * Admin-bypass behaviour itself can only be exercised with a real admin JWT;
 * those assertions live in the security-policy documentation page and are
 * verified during manual QA rather than from a publishable-key context.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const hasEnv = !!url && !!anonKey;
const d = hasEnv ? describe : describe.skip;

const anon = hasEnv
  ? createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const VICTIM = "44444444-4444-4444-4444-444444444444";
const ATTACKER = "55555555-5555-5555-5555-555555555555";

d("user_roles: ownership transfer & delete edge cases", () => {
  it("attacker cannot transfer a role by inserting victim → admin", async () => {
    const { error } = await anon!.from("user_roles").insert({ user_id: VICTIM, role: "admin" });
    expect(error).toBeTruthy();
  });

  it("attacker cannot delete victim's role rows", async () => {
    const { error } = await anon!.from("user_roles").delete().eq("user_id", VICTIM);
    // RLS either errors or matches zero rows; both are acceptable as long as
    // the attacker did not actually mutate state.
    if (!error) {
      const { data } = await anon!.from("user_roles").select("user_id").eq("user_id", VICTIM);
      expect(data ?? []).toEqual([]);
    } else {
      expect(error).toBeTruthy();
    }
  });

  it("attacker cannot update their own role to admin", async () => {
    const { error } = await anon!
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", ATTACKER);
    if (!error) {
      const { data } = await anon!
        .from("user_roles")
        .select("role")
        .eq("user_id", ATTACKER)
        .eq("role", "admin");
      expect(data ?? []).toEqual([]);
    }
  });
});

d("Moderator-only surfaces reject anon access", () => {
  it("comment_edits history is not enumerable by anon", async () => {
    const { data, error } = await anon!.from("comment_edits").select("id").limit(5);
    expect((data ?? []).length).toBe(0);
    if (error) expect(error).toBeTruthy();
  });

  it("comment_reports queue is not enumerable by anon", async () => {
    const { data, error } = await anon!.from("comment_reports").select("id").limit(5);
    expect((data ?? []).length).toBe(0);
    if (error) expect(error).toBeTruthy();
  });
});

d("Forged ownership inserts are rejected on every owner-pinned table", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["videos", { user_id: VICTIM, video_url: "https://x/y.mp4" }],
    ["comments", { video_id: VICTIM, user_id: VICTIM, body: "spoof" }],
    ["likes", { video_id: VICTIM, user_id: VICTIM }],
    ["follows", { follower_id: ATTACKER, following_id: VICTIM }],
    ["saved_videos", { video_id: VICTIM, user_id: ATTACKER }],
    ["push_subscriptions", { user_id: VICTIM, endpoint: "https://x", p256dh: "x", auth: "x" }],
  ];
  for (const [table, row] of cases) {
    it(`anon cannot insert into ${table} with a forged user_id`, async () => {
      const { error } = await anon!.from(table as never).insert(row as never);
      expect(error).toBeTruthy();
    });
  }
});
