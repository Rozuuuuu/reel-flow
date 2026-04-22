// Returns the visibility status of a video so the client can distinguish
// "not found" vs "private" vs "removed" — RLS hides those states from non-owners.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Status = "available" | "private" | "removed" | "not_found";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id || !isUuid(id)) {
    return new Response(
      JSON.stringify({ error: "id query parameter must be a valid UUID" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin
      .from("videos")
      .select("id, user_id, is_private, deleted_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let status: Status = "not_found";
    let creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null = null;
    if (data) {
      if (data.deleted_at) status = "removed";
      else if (data.is_private) status = "private";
      else status = "available";

      // Surface creator info for the UI (private state needs username for "View profile"/Request access).
      const { data: profile } = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", data.user_id)
        .maybeSingle();
      if (profile) creator = profile;
    }

    return new Response(JSON.stringify({ status, creator }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
