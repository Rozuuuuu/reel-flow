// Returns the public VAPID key so the browser can subscribe to Web Push.
// Safe to expose: VAPID public keys are designed to be shared with clients.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  return new Response(
    JSON.stringify({ vapidPublicKey, configured: vapidPublicKey.length > 0 }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
});
