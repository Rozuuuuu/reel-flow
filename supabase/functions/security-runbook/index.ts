// Admin-only server-side runbook endpoint.
//
// The raw markdown is co-located with this function and read from disk at
// request time — it is NEVER bundled into the client. Clients must present
// a valid Supabase JWT belonging to a user with the `admin` role, otherwise
// this function returns 401/403 without leaking a byte of the document.
//
// The client hits this via `supabase.functions.invoke("security-runbook")`
// which forwards the caller's Authorization header. `RequireAdmin` on the
// route is a UX signal; this function is the authoritative gate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Read the runbook once at cold-start. The file lives next to this module and
// is never served as a static asset — the only path to it is through this gate.
const RUNBOOK = await Deno.readTextFile(
  new URL("./runbook.md", import.meta.url),
);

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonError(401, "missing_bearer_token");
  }

  // Client with the CALLER's JWT — every query/RPC runs under their RLS.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jsonError(401, "invalid_token");

  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr) return jsonError(500, "role_check_failed");
  if (isAdmin !== true) return jsonError(403, "admin_required");

  // Fire-and-forget audit log — do not block on failure.
  void supabase.rpc("security_matrix_access_check", {
    _user_agent: req.headers.get("user-agent") ?? null,
  });

  return new Response(RUNBOOK, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
