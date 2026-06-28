/**
 * SECURITY DEFINER hardening tests.
 *
 * Verifies fix for finding:
 *   SUPA_authenticated_security_definer_function_executable
 *
 * Rules being asserted (as an unauthenticated / non-admin caller through the
 * Data API):
 *   1. Functions in the `private` schema MUST NOT be reachable via PostgREST.
 *      The Data API only exposes the `public` schema, so an RPC call targeting
 *      a private function should fail (404 / PGRST202 / similar), never
 *      succeed.
 *   2. Public wrappers (`has_role`, `is_moderator`, `can_view_video`) are
 *      SECURITY INVOKER and may be callable, but they must never return `true`
 *      for an anonymous caller — i.e. there is no privilege escalation path
 *      through them.
 *   3. Trigger-only definer functions in `public` (e.g. update_updated_at_*)
 *      have had EXECUTE revoked from `anon` / `authenticated`; calling them
 *      directly via RPC must be rejected.
 *
 * Auto-skipped if VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not
 * provided (forks / local without secrets).
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const hasEnv = !!url && !!anonKey;
const d = hasEnv ? describe : describe.skip;

const anon = hasEnv
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

const rpcRejected = (error: unknown) => {
  // Either PostgREST refuses to find the function (because it's not in the
  // exposed schema or the role lacks EXECUTE), or Postgres raises a
  // permission/insufficient-privilege error. All of those are acceptable —
  // the only unacceptable outcome is `error === null`.
  expect(error).not.toBeNull();
};

d("SECURITY DEFINER: private helpers are not reachable via the Data API", () => {
  it("anon cannot RPC a function in the private schema", async () => {
    // Targeting `private.has_role` style names should always fail because the
    // Data API only exposes `public`.
    const { error } = await (anon as any).schema("private").rpc("has_role", {
      _user_id: FAKE_UUID,
      _role: "admin",
    });
    rpcRejected(error);
  });

  it("anon cannot RPC private.can_view_video", async () => {
    const { error } = await (anon as any).schema("private").rpc("can_view_video", {
      _video_id: FAKE_UUID,
    });
    rpcRejected(error);
  });
});

d("SECURITY DEFINER: public wrappers do not leak admin privileges", () => {
  it("public.has_role returns false (never true) for an anonymous caller", async () => {
    const { data, error } = await anon!.rpc("has_role", {
      _user_id: FAKE_UUID,
      _role: "admin",
    });
    // Either the wrapper is callable and returns false, or PostgREST rejects
    // the call — both prove there is no privilege escalation path.
    if (error) {
      rpcRejected(error);
    } else {
      expect(data).toBe(false);
    }
  });

  it("public.is_moderator returns false for an anonymous caller", async () => {
    const { data, error } = await anon!.rpc("is_moderator", {
      _user_id: FAKE_UUID,
    });
    if (error) {
      rpcRejected(error);
    } else {
      expect(data).toBe(false);
    }
  });
});

d("SECURITY DEFINER: trigger-only functions are not directly executable", () => {
  it("anon cannot RPC update_updated_at_column directly", async () => {
    const { error } = await anon!.rpc("update_updated_at_column" as never);
    rpcRejected(error);
  });
});
