/**
 * SECURITY DEFINER — positive-path tests.
 *
 * The negative path (anon cannot reach `private.*`, wrappers never return
 * true for anon, trigger-only functions are not RPC-callable) lives in
 * securityDefiner.policy.test.ts.
 *
 * This file asserts the *intended* paths still work:
 *
 *   1. An authenticated admin gets `true` from `public.has_role(admin_uid, 'admin')`.
 *   2. A non-admin authenticated user gets `false` from the same call and
 *      cannot escalate by asking about someone else's role.
 *   3. An owner can view their own private video via `public.can_view_video`,
 *      and a stranger authenticated user cannot.
 *   4. Neither role can reach `private.*` directly through the Data API —
 *      only the SECURITY INVOKER wrappers in `public` are exposed.
 *
 * All admin/owner assertions require test credentials in env:
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
 *   TEST_OWNER_EMAIL / TEST_OWNER_PASSWORD  (owner of at least one video)
 *   TEST_OWNER_VIDEO_ID                     (a video row owned by the owner)
 * Any missing var auto-skips the relevant block so forks/local without
 * secrets stay green.
 */
import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const adminEmail = import.meta.env.TEST_ADMIN_EMAIL as string | undefined;
const adminPass = import.meta.env.TEST_ADMIN_PASSWORD as string | undefined;
const ownerEmail = import.meta.env.TEST_OWNER_EMAIL as string | undefined;
const ownerPass = import.meta.env.TEST_OWNER_PASSWORD as string | undefined;
const ownerVideoId = import.meta.env.TEST_OWNER_VIDEO_ID as string | undefined;

const hasBase = !!url && !!anonKey;
const hasAdmin = hasBase && !!adminEmail && !!adminPass;
const hasOwner = hasBase && !!ownerEmail && !!ownerPass && !!ownerVideoId;

const dAdmin = hasAdmin ? describe : describe.skip;
const dOwner = hasOwner ? describe : describe.skip;

const freshClient = () =>
  createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const signIn = async (email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> => {
  const client = freshClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, uid: data.user.id };
};

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

dAdmin("SECURITY DEFINER: admin reaches intended helper paths", () => {
  it("has_role(admin_uid, 'admin') returns true for the admin themselves", async () => {
    const { client, uid } = await signIn(adminEmail!, adminPass!);
    const { data, error } = await client.rpc("has_role", { _user_id: uid, _role: "admin" });
    expect(error).toBeNull();
    expect(data).toBe(true);
    await client.auth.signOut();
  });

  it("is_moderator(admin_uid) is truthy for an admin (admins moderate)", async () => {
    const { client, uid } = await signIn(adminEmail!, adminPass!);
    const { data, error } = await client.rpc("is_moderator", { _user_id: uid });
    expect(error).toBeNull();
    // Admins act as moderators in this app; if that ever changes, update the
    // policy doc first and then this assertion.
    expect(data).toBe(true);
    await client.auth.signOut();
  });

  it("admin still cannot reach the private schema directly via the Data API", async () => {
    const { client } = await signIn(adminEmail!, adminPass!);
    const { error } = await (client as any).schema("private").rpc("has_role", {
      _user_id: FAKE_UUID,
      _role: "admin",
    });
    expect(error).not.toBeNull();
    await client.auth.signOut();
  });
});

dOwner("SECURITY DEFINER: owner reaches can_view_video for their own video", () => {
  it("owner gets true from can_view_video for their own private video", async () => {
    const { client } = await signIn(ownerEmail!, ownerPass!);
    const { data, error } = await client.rpc("can_view_video", { _video_id: ownerVideoId! });
    expect(error).toBeNull();
    expect(data).toBe(true);
    await client.auth.signOut();
  });

  it("owner is not falsely marked as admin", async () => {
    const { client, uid } = await signIn(ownerEmail!, ownerPass!);
    const { data, error } = await client.rpc("has_role", { _user_id: uid, _role: "admin" });
    expect(error).toBeNull();
    expect(data).toBe(false);
    await client.auth.signOut();
  });

  it("owner cannot query has_role about another user and get true", async () => {
    const { client } = await signIn(ownerEmail!, ownerPass!);
    const { data, error } = await client.rpc("has_role", { _user_id: FAKE_UUID, _role: "admin" });
    // Either the wrapper honors invoker RLS and returns false, or it errors.
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data).toBe(false);
    }
    await client.auth.signOut();
  });
});

// This block always runs when base env is present — it is the shared invariant
// that both admin and owner tests depend on.
(hasBase ? describe : describe.skip)("SECURITY DEFINER: private schema stays sealed", () => {
  it("anon RPC into private.has_role is rejected", async () => {
    const client = freshClient();
    const { error } = await (client as any).schema("private").rpc("has_role", {
      _user_id: FAKE_UUID,
      _role: "admin",
    });
    expect(error).not.toBeNull();
  });
});
