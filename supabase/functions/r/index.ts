// Public, crawler-friendly preview redirect for shared reels.
// URL shape: /functions/v1/r/<videoId>
// - Returns HTML with per-reel Open Graph / Twitter Card tags
// - Includes a meta refresh + JS redirect so humans land on /?v=<id> in the SPA
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SITE_NAME = "Reelo";
const DEFAULT_DESC =
  "Reelo is a vertical short-video app. Upload, watch and react to bite-sized videos from creators.";
const DEFAULT_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/adf7c33d-20aa-4227-a72d-ae671171e3f7/id-preview-f6e45d1d--2567e0ac-4446-4af5-97b5-341d8f176756.lovable.app-1776784739591.png";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function buildHtml(opts: {
  title: string;
  description: string;
  image: string;
  redirect: string;
  canonical: string;
}) {
  const { title, description, image, redirect, canonical } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:type" content="video.other" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirect)}" />
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(redirect)}">${escapeHtml(redirect)}</a>…</p>
<script>window.location.replace(${JSON.stringify(redirect)});</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Path is /r/<id> (Supabase strips the /functions/v1 prefix when routing)
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1];
  // Where humans should end up. Defaults to deployed site, can be overridden via ?app=
  const appOriginParam = url.searchParams.get("app");
  const appOrigin =
    appOriginParam && /^https?:\/\//.test(appOriginParam)
      ? appOriginParam.replace(/\/$/, "")
      : "https://bright-reels.lovable.app";
  const redirect = id ? `${appOrigin}/?v=${encodeURIComponent(id)}` : appOrigin;

  if (!id || id === "r" || !isUuid(id)) {
    return new Response(
      buildHtml({
        title: SITE_NAME,
        description: DEFAULT_DESC,
        image: DEFAULT_IMAGE,
        redirect: appOrigin,
        canonical: appOrigin,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  let title = `${SITE_NAME} — Watch this reel`;
  let description = DEFAULT_DESC;
  let image = DEFAULT_IMAGE;

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: video } = await admin
      .from("videos")
      .select("id, caption, thumbnail_url, user_id, is_private, deleted_at")
      .eq("id", id)
      .maybeSingle();

    if (video && !video.is_private && !video.deleted_at) {
      const { data: profile } = await admin
        .from("profiles")
        .select("username, display_name")
        .eq("id", video.user_id)
        .maybeSingle();

      const handle = profile?.username ? `@${profile.username}` : "a creator";
      const name = profile?.display_name || profile?.username || "Reelo";
      title = `${name} on ${SITE_NAME}`;
      description = video.caption?.trim()
        ? `${video.caption.trim()} — ${handle} on ${SITE_NAME}`
        : `Watch ${handle}'s reel on ${SITE_NAME}.`;
      if (video.thumbnail_url) image = video.thumbnail_url;
    }
  } catch (_err) {
    // Fall through with defaults — never block the redirect on metadata errors
  }

  return new Response(
    buildHtml({
      title,
      description,
      image,
      redirect,
      canonical: redirect,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
});
