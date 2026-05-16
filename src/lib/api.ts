/**
 * Thin fetch wrapper that always targets VITE_API_URL (default "/api").
 *
 * Includes automatic retry with exponential backoff for transient failures
 * (network errors, 408/425/429/500/502/503/504), a per-request correlation ID
 * (sent as `X-Request-Id` and surfaced in failure toasts), and a friendly
 * sonner toast on final failure.
 */
import { toast } from "sonner";
import { env } from "./env";

function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Generate a short, copy-friendly correlation ID. */
export function makeRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().split("-")[0]
      : Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `req_${ts}_${rand}`;
}

export interface ApiFetchOptions extends RequestInit {
  /** Max retry attempts for transient failures. Default: 3 */
  retries?: number;
  /** Base backoff in ms (exponential). Default: 300 */
  backoffMs?: number;
  /** Suppress the failure toast (e.g. background pollers). Default: false */
  silent?: boolean;
  /** Override the auto-generated correlation ID. */
  requestId?: string;
}

export class ApiError extends Error {
  status: number;
  requestId: string;
  body: string;
  constructor(message: string, status: number, requestId: string, body = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.body = body;
  }
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attempt to copy text to the clipboard. Returns true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to manual */
  }
  return false;
}

function showFailureToast(message: string, requestId: string, description?: string) {
  toast.error(message, {
    description: `${description ? description + " · " : ""}ID: ${requestId}`,
    action: {
      label: "Copy ID",
      onClick: async () => {
        const ok = await copyToClipboard(requestId);
        if (!ok) {
          // Clipboard unavailable — surface the ID as selectable text so the
          // user can copy it manually.
          toast.message("Copy this request ID", {
            description: requestId,
            duration: 15_000,
          });
        }
      },
    },
  });
}

export async function apiFetch(path: string, init: ApiFetchOptions = {}): Promise<Response> {
  const { retries = 3, backoffMs = 300, silent = false, requestId, ...rest } = init;
  const base = env().API_URL;
  const url = joinUrl(base, path);
  const reqId = requestId ?? makeRequestId();

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        ...rest,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": reqId,
          ...(rest.headers || {}),
        },
      });

      if (TRANSIENT_STATUSES.has(res.status) && attempt < retries) {
        await sleep(backoffMs * 2 ** attempt + Math.random() * 100);
        attempt++;
        continue;
      }
      // Stamp the request ID on the response for downstream consumers.
      try {
        (res as Response & { requestId?: string }).requestId = reqId;
      } catch {
        /* readonly response — ignore */
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      await sleep(backoffMs * 2 ** attempt + Math.random() * 100);
      attempt++;
    }
  }

  if (!silent) {
    showFailureToast("Connection issue", reqId, "Couldn't reach the server");
  }
  const msg = lastErr instanceof Error ? lastErr.message : "Network request failed";
  throw new ApiError(msg, 0, reqId);
}

export async function apiJson<T = unknown>(path: string, init: ApiFetchOptions = {}): Promise<T> {
  const reqId = init.requestId ?? makeRequestId();
  const res = await apiFetch(path, { ...init, requestId: reqId });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (!init.silent) {
      showFailureToast(`Request failed (${res.status})`, reqId, text?.slice(0, 120) || res.statusText);
    }
    throw new ApiError(`API ${res.status}: ${text || res.statusText}`, res.status, reqId, text);
  }
  return res.json() as Promise<T>;
}

export function apiUrl(path = ""): string {
  return joinUrl(env().API_URL, path);
}

export interface HealthResponse {
  ok: boolean;
  service?: string;
  time?: string;
  version?: string;
}

export interface EnvDiagnosticsResponse {
  ok: boolean;
  present: Record<string, boolean>;
  allowedOrigins: string[];
  hostname: string | null;
  nodeEnv: string;
}

/** Ping /api/health. Silent — used by the diagnostics indicator. */
export async function checkHealth(): Promise<HealthResponse | null> {
  try {
    return await apiJson<HealthResponse>("/health", { silent: true, retries: 1 });
  } catch {
    return null;
  }
}

/** Fetch /api/env diagnostics (no secrets). */
export async function fetchEnvDiagnostics(): Promise<EnvDiagnosticsResponse | null> {
  try {
    return await apiJson<EnvDiagnosticsResponse>("/env", { silent: true, retries: 1 });
  } catch {
    return null;
  }
}

/** Ping the Supabase Edge Function used for video-status lookups. */
export async function checkEdgeFunction(): Promise<{ ok: boolean; status: number } | null> {
  try {
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!base || !key) return null;
    // OPTIONS preflight is allowed without auth and is the cheapest reachability check.
    const res = await fetch(`${base}/functions/v1/video-status`, {
      method: "OPTIONS",
      headers: { apikey: key },
    });
    return { ok: res.ok || res.status === 204 || res.status === 405, status: res.status };
  } catch {
    return null;
  }
}
