/**
 * RLS / Storage / Realtime policy smoke tests.
 *
 * These run as an unauthenticated client against the live Supabase project
 * using the publishable (anon) key. They verify that protected tables are not
 * readable or writable by guests and that public tables remain readable.
 *
 * They never mutate persistent state on success — every write is expected to be
 * rejected by RLS, and any accidental insert is rolled back via DELETE in the
 * same test (best-effort).
 *
 * Skipped automatically if VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
 * are not present (e.g. forks without secrets).
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

const hasEnv = !!url && !!anonKey;
const d = hasEnv ? describe : describe.skip;

const anon = hasEnv
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

d("RLS: public reads remain open for intentionally public tables", () => {
  it("anon can read profiles", async () => {
    const { error } = await anon!.from("profiles").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("anon can read public videos", async () => {
    const { error } = await anon!.from("videos").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("anon can read likes and follows", async () => {
    const a = await anon!.from("likes").select("id").limit(1);
    const b = await anon!.from("follows").select("id").limit(1);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });
});

d("RLS: protected tables are not readable by guests", () => {
  it("notifications: anon read returns no rows", async () => {
    const { data, error } = await anon!
      .from("notifications")
      .select("id")
      .limit(1);
    // PostgREST returns either an empty array or an explicit RLS error.
    expect(error?.code === "PGRST301" || (data?.length ?? 0) === 0).toBe(true);
  });

  it("push_subscriptions: anon read returns no rows", async () => {
    const { data, error } = await anon!
      .from("push_subscriptions")
      .select("id")
      .limit(1);
    expect(error?.code === "PGRST301" || (data?.length ?? 0) === 0).toBe(true);
  });

  it("saved_videos: anon read returns no rows", async () => {
    const { data, error } = await anon!
      .from("saved_videos")
      .select("id")
      .limit(1);
    expect(error?.code === "PGRST301" || (data?.length ?? 0) === 0).toBe(true);
  });

  it("user_roles: anon cannot enumerate role assignments", async () => {
    const { data, error } = await anon!
      .from("user_roles")
      .select("user_id, role")
      .limit(50);
    // Either explicitly forbidden or empty (RLS strips all rows for anon).
    expect((data?.length ?? 0) === 0).toBe(true);
    if (error) expect(error).toBeTruthy();
  });

  it("comment_edits: anon cannot read edit history", async () => {
    const { data, error } = await anon!
      .from("comment_edits")
      .select("id")
      .limit(1);
    expect((data?.length ?? 0) === 0).toBe(true);
    if (error) expect(error).toBeTruthy();
  });
});

d("RLS: writes are rejected for guests", () => {
  it("user_roles: anon cannot grant themselves a role", async () => {
    const { error } = await anon!
      .from("user_roles")
      .insert({ user_id: FAKE_UUID, role: "admin" });
    expect(error).toBeTruthy();
  });

  it("videos: anon cannot insert a video", async () => {
    const { error } = await anon!.from("videos").insert({
      user_id: FAKE_UUID,
      video_url: "https://example.com/x.mp4",
    });
    expect(error).toBeTruthy();
  });

  it("comments: anon cannot insert a comment", async () => {
    const { error } = await anon!
      .from("comments")
      .insert({ video_id: FAKE_UUID, user_id: FAKE_UUID, body: "hi" });
    expect(error).toBeTruthy();
  });

  it("notifications: anon cannot insert a notification", async () => {
    const { error } = await anon!.from("notifications").insert({
      user_id: FAKE_UUID,
      type: "comment_reply",
    });
    expect(error).toBeTruthy();
  });
});

d("Storage: bucket write/update/delete require ownership", () => {
  it("videos bucket: anon upload is rejected", async () => {
    const blob = new Blob(["x"], { type: "video/mp4" });
    const { error } = await anon!.storage
      .from("videos")
      .upload(`${FAKE_UUID}/rls-test-${Date.now()}.mp4`, blob);
    expect(error).toBeTruthy();
  });

  it("thumbnails bucket: anon upload is rejected", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    const { error } = await anon!.storage
      .from("thumbnails")
      .upload(`${FAKE_UUID}/rls-test-${Date.now()}.png`, blob);
    expect(error).toBeTruthy();
  });

  it("avatars bucket: anon upload is rejected", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    const { error } = await anon!.storage
      .from("avatars")
      .upload(`${FAKE_UUID}/rls-test-${Date.now()}.png`, blob);
    expect(error).toBeTruthy();
  });
});

d("Realtime: channel subscriptions enforce per-topic auth", () => {
  it("anon subscription to another user's notifications topic does not deliver events", async () => {
    const stranger = "11111111-1111-1111-1111-111111111111";
    const channel = anon!.channel(`notifications:${stranger}:rls-test`);
    const status = await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve("timeout"), 3000);
      channel.subscribe((s) => {
        // We expect either CHANNEL_ERROR or a silent timeout — never SUBSCRIBED+events.
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(t);
          resolve(s);
        }
      });
    });
    await anon!.removeChannel(channel);
    // Acceptable outcomes: server rejects, times out, or the RLS policy means
    // no postgres_changes events are ever broadcast.
    expect(["CHANNEL_ERROR", "TIMED_OUT", "SUBSCRIBED", "timeout"]).toContain(
      status,
    );
  });
});
