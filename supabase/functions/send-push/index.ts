// Sends pending Web Push notifications.
// Triggered after notification rows are inserted; invoked from the client right
// after a reply is created (best-effort — the trigger already creates the
// in-app notification, push is a bonus delivery channel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import webpush from "https://esm.sh/web-push@3.6.7";

interface PushPayload {
  notificationId?: string;
  userId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const VAPID_SUBJECT =
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:notifications@reelo.app";

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(
      JSON.stringify({ error: "VAPID keys not configured", sent: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  let body: PushPayload = {};
  try {
    body = (await req.json()) as PushPayload;
  } catch {
    /* allow empty body */
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Resolve target notification(s)
  let notifQuery = supabase
    .from("notifications")
    .select("id, user_id, type, comment_id, video_id, data, actor_id")
    .order("created_at", { ascending: false })
    .limit(20);

  if (body.notificationId) {
    notifQuery = notifQuery.eq("id", body.notificationId);
  } else if (body.userId) {
    notifQuery = notifQuery.eq("user_id", body.userId);
  } else {
    return new Response(
      JSON.stringify({ error: "notificationId or userId required" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }

  const { data: notifs, error: notifErr } = await notifQuery;
  if (notifErr) {
    return new Response(JSON.stringify({ error: notifErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  let totalSent = 0;
  let totalFailed = 0;
  const expiredEndpoints: string[] = [];

  for (const n of notifs ?? []) {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", n.user_id);

    let actorName = "Someone";
    if (n.actor_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", n.actor_id)
        .maybeSingle();
      if (prof) actorName = "@" + (prof.username ?? "user");
    }

    const dataObj = (n.data ?? {}) as Record<string, unknown>;
    const preview =
      typeof dataObj.preview === "string" ? dataObj.preview : "";
    const payload = JSON.stringify({
      title:
        n.type === "comment_reply"
          ? `${actorName} replied to your comment`
          : `${actorName} on Reelo`,
      body: preview,
      url: n.video_id
        ? `/?v=${n.video_id}${n.comment_id ? `&c=${n.comment_id}` : ""}`
        : "/",
      tag: `notif-${n.id}`,
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        totalSent++;
      } catch (err) {
        totalFailed++;
        const status =
          (err as { statusCode?: number })?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }
  }

  if (expiredEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }

  return new Response(
    JSON.stringify({ sent: totalSent, failed: totalFailed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
