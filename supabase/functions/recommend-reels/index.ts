// recommend-reels — ranks public reels for a viewer using Lovable AI.
// Signals: viewer interests + captions/hashtags of reels they liked or saved.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createOpenAI } from "npm:@ai-sdk/openai";
import {
  streamText,
  Output,
  NoObjectGeneratedError,
  type ModelMessage,
} from "npm:ai";
import { z } from "npm:zod";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
} from "../_shared/run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

// Request validation (bounds here are input limits, not model schema bounds).
const BodySchema = z.object({
  interests: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  savedVideoIds: z.array(z.string().uuid()).max(100).optional(),
});

// Strict, small, flat model schema — every property required, no bounds.
const RankingSchema = z.object({
  recommendations: z.array(
    z.object({
      video_id: z.string(),
      reason: z.string(),
    }),
  ),
});

interface ReelRef {
  id: string;
  caption: string | null;
  hashtags: string[];
  views_count: number;
}

function json(data: unknown, status: number, runId?: string) {
  const headers = getLovableAiGatewayResponseHeaders(undefined, {
    ...corsHeaders,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...(runId ? { "X-Lovable-AIG-Run-ID": runId } : {}),
  });
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return json(
      {
        error: "Invalid request body",
        details: err instanceof z.ZodError ? err.flatten().fieldErrors : undefined,
      },
      400,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Resolve the signed-in viewer from the Authorization header, if present.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) {
    try {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  // Candidate pool: public, non-deleted reels (most recent first).
  const { data: candidateRows, error: candidatesError } = await admin
    .from("videos")
    .select("id, caption, hashtags, views_count")
    .eq("is_private", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (candidatesError) {
    return json({ error: candidatesError.message }, 500);
  }
  const candidates: ReelRef[] = (candidateRows ?? []).map((r) => ({
    id: r.id as string,
    caption: (r.caption as string | null) ?? null,
    hashtags: (r.hashtags as string[] | null) ?? [],
    views_count: (r.views_count as number) ?? 0,
  }));
  if (candidates.length === 0) {
    return json({ recommendations: [] });
  }

  // Taste signals. Signed-in viewers: server-side likes + saves (trustworthy).
  // Guests: only saved ids they passed, validated against public reels.
  const signalIds = new Set<string>();
  if (userId) {
    const [savedRes, likesRes] = await Promise.all([
      admin.from("saved_videos").select("video_id").eq("user_id", userId).limit(50),
      admin.from("likes").select("video_id").eq("user_id", userId).limit(100),
    ]);
    (savedRes.data ?? []).forEach((r) => signalIds.add(r.video_id as string));
    (likesRes.data ?? []).forEach((r) => signalIds.add(r.video_id as string));
  } else {
    const guestIds = body.savedVideoIds ?? [];
    if (guestIds.length > 0) {
      const { data } = await admin
        .from("videos")
        .select("id")
        .in("id", guestIds)
        .eq("is_private", false)
        .is("deleted_at", null);
      (data ?? []).forEach((r) => signalIds.add(r.id as string));
    }
  }

  let signalReels: ReelRef[] = [];
  if (signalIds.size > 0) {
    const { data } = await admin
      .from("videos")
      .select("id, caption, hashtags, views_count")
      .in("id", Array.from(signalIds))
      .limit(150);
    signalReels = (data ?? []).map((r) => ({
      id: r.id as string,
      caption: (r.caption as string | null) ?? null,
      hashtags: (r.hashtags as string[] | null) ?? [],
      views_count: (r.views_count as number) ?? 0,
    }));
  }

  // Prefer reels the viewer hasn't already liked/saved, when enough remain.
  const fresh = candidates.filter((c) => !signalIds.has(c.id));
  const pool = fresh.length >= 4 ? fresh : candidates;

  if (!LOVABLE_API_KEY) {
    return json({ error: "AI is not configured for this project." }, 500);
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey: LOVABLE_API_KEY,
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  const instructions = [
    "You are the recommendation engine for Reelo, a short-video (reels) app.",
    "Rank the given candidate reels for this viewer, best first, and return 8-12 picks (fewer only if there are fewer candidates).",
    "Use the viewer's stated interests plus the captions and hashtags of reels they liked or saved as taste signals.",
    "Recommend only reels from the candidate list, using their exact ids. Never invent ids.",
    "When the viewer has liked or saved reels, prefer fresh candidates they have not already seen.",
    "Each reason is one short punchy phrase of at most 12 words explaining why that reel fits this viewer. No hashtags in reasons.",
    "Return only the JSON object matching the required schema.",
  ].join(" ");

  const payload = {
    interests: body.interests,
    viewer_liked_or_saved: signalReels.map((r) => ({
      caption: r.caption,
      hashtags: r.hashtags,
    })),
    candidates: pool.map((c) => ({
      id: c.id,
      caption: c.caption,
      hashtags: c.hashtags,
      views: c.views_count,
    })),
  };
  const messages: ModelMessage[] = [
    { role: "user", content: JSON.stringify(payload) },
  ];

  const result = streamText({
    model: provider.responses(MODEL),
    instructions,
    messages,
    abortSignal: req.signal,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    output: Output.object({ schema: RankingSchema }),
  });

  let parsed: z.infer<typeof RankingSchema> | undefined;
  try {
    parsed = await result.output;
  } catch (err) {
    const runId = runIdFetch.getRunId();
    if (NoObjectGeneratedError.isInstance(err)) {
      return json(
        { error: "The AI could not produce a valid ranking. Try again." },
        502,
        runId,
      );
    }
    const status = (err as { statusCode?: number; status?: number }).statusCode ??
      (err as { status?: number }).status;
    const message = (err as { message?: string }).message ?? "";
    if (status === 402) {
      return json({ error: message || "AI credits are exhausted." }, 402, runId);
    }
    if (req.signal.aborted) {
      return json({ error: "Request cancelled." }, 499, runId);
    }
    console.error("recommend-reels model error:", message);
    return json({ error: "Recommendation service error." }, 500, runId);
  }

  // Normalize: keep only real candidate ids, dedupe, clamp count and reason length.
  const byId = new Map(pool.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const recommendations: { video_id: string; reason: string }[] = [];
  for (const rec of parsed?.recommendations ?? []) {
    const id = rec?.video_id;
    if (!id || !byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    recommendations.push({
      video_id: id,
      reason: String(rec.reason ?? "").trim().slice(0, 140),
    });
    if (recommendations.length >= 12) break;
  }

  // Guarantee a non-empty result: fall back to pool order with a generic reason.
  if (recommendations.length === 0) {
    for (const c of pool) {
      recommendations.push({ video_id: c.id, reason: "Picked from your interests" });
      if (recommendations.length >= 8) break;
    }
  }

  return json({ recommendations }, 200, runIdFetch.getRunId());
});
