// Automated validator for the `r` (OG redirect) edge function.
//
// GET /functions/v1/og-check?id=<videoId>
//   → fetches /functions/v1/r/<videoId> and asserts that the returned HTML
//     contains non-default og:title / og:description / og:image meta tags.
//
// Returns:
//   200 { ok: true,  videoId, og: {...}, checks: {...} }   on success
//   200 { ok: false, videoId, og: {...}, checks: {...}, errors: [...] } on validation failure
//   500 on unexpected error
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_DESC =
  "Reelo is a vertical short-video app. Upload, watch and react to bite-sized videos from creators.";
const DEFAULT_IMAGE_HOST = "pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function metaContent(html: string, prop: string): string | null {
  // Match <meta property="<prop>" content="..."> OR <meta name="<prop>" content="...">
  const re = new RegExp(
    `<meta\\s+(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}["']\\s+content=["']([^"']*)["']`,
    "i",
  );
  return html.match(re)?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let videoId = url.searchParams.get("id");

    // If no id provided, pick the most recent public reel as a smoke test.
    if (!videoId) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data, error } = await admin
        .from("videos")
        .select("id")
        .is("deleted_at", null)
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return new Response(
          JSON.stringify({
            ok: false,
            errors: ["no public reels available to validate against"],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      videoId = data.id;
    }

    if (!isUuid(videoId)) {
      return new Response(
        JSON.stringify({ ok: false, errors: ["videoId is not a valid UUID"] }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch the OG-rendering function
    const target = `${SUPABASE_URL}/functions/v1/r/${videoId}`;
    const res = await fetch(target, {
      headers: { "User-Agent": "og-check/1.0 (Twitterbot-compatible)" },
    });
    const html = await res.text();

    const og = {
      title: metaContent(html, "og:title"),
      description: metaContent(html, "og:description"),
      image: metaContent(html, "og:image"),
      url: metaContent(html, "og:url"),
      twitterCard: metaContent(html, "twitter:card"),
      twitterTitle: metaContent(html, "twitter:title"),
      twitterImage: metaContent(html, "twitter:image"),
    };

    // Look up expected metadata from the DB (service role bypasses RLS)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: video } = await admin
      .from("videos")
      .select("id, caption, thumbnail_url, user_id, is_private, deleted_at")
      .eq("id", videoId)
      .maybeSingle();

    const errors: string[] = [];
    const checks: Record<string, boolean> = {};

    checks.statusOk = res.status === 200;
    if (!checks.statusOk) errors.push(`r returned status ${res.status}`);

    checks.hasOgTitle = !!og.title && og.title.trim().length > 0;
    if (!checks.hasOgTitle) errors.push("og:title missing or empty");

    checks.hasOgDescription =
      !!og.description && og.description.trim().length > 0;
    if (!checks.hasOgDescription) errors.push("og:description missing or empty");

    checks.hasOgImage = !!og.image && og.image.trim().length > 0;
    if (!checks.hasOgImage) errors.push("og:image missing or empty");

    checks.hasTwitterCard = og.twitterCard === "summary_large_image";
    if (!checks.hasTwitterCard)
      errors.push(`twitter:card should be summary_large_image, got ${og.twitterCard}`);

    if (video && !video.is_private && !video.deleted_at) {
      // Per-reel checks: title should reference the creator handle/name,
      // description should include the caption (when present), image should
      // be the reel's thumbnail (when present) and NOT the site fallback.
      checks.titleNotDefault = og.title !== "Reelo";
      if (!checks.titleNotDefault)
        errors.push("og:title is the site default — not personalized for this reel");

      checks.descriptionNotDefault =
        !!og.description && og.description !== DEFAULT_DESC;
      if (!checks.descriptionNotDefault)
        errors.push("og:description is the site default");

      if (video.thumbnail_url) {
        checks.imageMatchesThumbnail = og.image === video.thumbnail_url;
        if (!checks.imageMatchesThumbnail)
          errors.push(
            `og:image should be the reel thumbnail (${video.thumbnail_url}), got ${og.image}`,
          );
      } else {
        checks.imageIsFallback = !!og.image?.includes(DEFAULT_IMAGE_HOST);
        if (!checks.imageIsFallback)
          errors.push("og:image should fall back to the site image when no thumbnail exists");
      }

      if (video.caption?.trim()) {
        checks.descriptionContainsCaption =
          !!og.description?.includes(video.caption.trim());
        if (!checks.descriptionContainsCaption)
          errors.push("og:description should embed the reel caption");
      }
    }

    const ok = errors.length === 0;
    return new Response(
      JSON.stringify(
        {
          ok,
          videoId,
          target,
          status: res.status,
          og,
          checks,
          errors: ok ? undefined : errors,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
