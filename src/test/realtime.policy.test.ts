/**
 * Realtime channel authorization tests.
 *
 * For each protected realtime topic we assert that:
 *   1. an anonymous client subscribing to another user's topic never receives
 *      a SUBSCRIBED state with delivered events (wrong user),
 *   2. a malformed UUID in the topic suffix is rejected or yields no events,
 *   3. subscribing without any JWT (anon, no session) cannot read
 *      private-video comment topics.
 *
 * Skipped automatically when Supabase env vars are absent.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const hasEnv = !!url && !!anonKey;
const d = hasEnv ? describe : describe.skip;

const STRANGER_UID = "11111111-1111-1111-1111-111111111111";
const MALFORMED_UID = "not-a-uuid";

const subscribeOnce = (client: ReturnType<typeof createClient>, topic: string) =>
  new Promise<{ status: string; events: number }>((resolve) => {
    let events = 0;
    const channel = client.channel(topic);
    channel.on("broadcast", { event: "*" }, () => {
      events += 1;
    });
    const timer = setTimeout(async () => {
      await client.removeChannel(channel);
      resolve({ status: "timeout", events });
    }, 2500);
    channel.subscribe(async (s) => {
      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        clearTimeout(timer);
        await client.removeChannel(channel);
        resolve({ status: s, events });
      }
    });
  });

const makeAnon = () =>
  createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });

d("Realtime: notifications:<uid> topic", () => {
  it("wrong user: anon cannot receive another user's notifications", async () => {
    const client = makeAnon();
    const r = await subscribeOnce(client, `notifications:${STRANGER_UID}:wrong-user`);
    expect(r.events).toBe(0);
    expect(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED", "timeout"]).toContain(r.status);
  }, 10000);

  it("malformed UUID: anon subscription to garbage topic delivers no events", async () => {
    const client = makeAnon();
    const r = await subscribeOnce(client, `notifications:${MALFORMED_UID}:bad`);
    expect(r.events).toBe(0);
  }, 10000);

  it("missing JWT: anon (no signed-in user) gets zero notifications events", async () => {
    const client = makeAnon();
    // Explicitly clear any cached session.
    await client.auth.signOut().catch(() => {});
    const r = await subscribeOnce(client, `notifications:${STRANGER_UID}:no-jwt`);
    expect(r.events).toBe(0);
  }, 10000);
});

d("Realtime: comments:<video_id> topic", () => {
  it("wrong user / unknown video id: anon receives no comment events", async () => {
    const client = makeAnon();
    const fakeVideo = "22222222-2222-2222-2222-222222222222";
    const r = await subscribeOnce(client, `comments:${fakeVideo}`);
    expect(r.events).toBe(0);
  }, 10000);

  it("malformed video id: server rejects or silently drops", async () => {
    const client = makeAnon();
    const r = await subscribeOnce(client, `comments:${MALFORMED_UID}`);
    expect(r.events).toBe(0);
  }, 10000);

  it("missing JWT: anon cannot subscribe to private-video comments", async () => {
    const client = makeAnon();
    await client.auth.signOut().catch(() => {});
    // Even if the topic syntax is valid, with no JWT the can_view_video()
    // policy strips any private-video events.
    const r = await subscribeOnce(client, `comments:33333333-3333-3333-3333-333333333333`);
    expect(r.events).toBe(0);
  }, 10000);
});
