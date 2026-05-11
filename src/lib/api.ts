/**
 * Thin fetch wrapper that always targets VITE_API_URL (default "/api").
 *
 * Using a relative default lets Render's reverse-proxy forward /api/* to the
 * backend service so the browser stays same-origin and CORS is a non-issue.
 * Override with VITE_API_URL=https://api.example.com for direct cross-origin.
 *
 * Includes automatic retry with exponential backoff for transient failures
 * (network errors, 502/503/504) and surfaces a friendly toast on final failure.
 */
import { toast } from "sonner";
import { env } from "./env";

function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export interface ApiFetchOptions extends RequestInit {
  /** Max retry attempts for transient failures. Default: 3 */
  retries?: number;
  /** Base backoff in ms (exponential). Default: 300 */
  backoffMs?: number;
  /** Suppress the failure toast (e.g. background pollers). Default: false */
  silent?: boolean;
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function apiFetch(path: string, init: ApiFetchOptions = {}): Promise<Response> {
  const { retries = 3, backoffMs = 300, silent = false, ...rest } = init;
  const base = env().API_URL;
  const url = joinUrl(base, path);

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        ...rest,
        headers: {
          "Content-Type": "application/json",
          ...(rest.headers || {}),
        },
      });

      // Retry on transient HTTP statuses.
      if (TRANSIENT_STATUSES.has(res.status) && attempt < retries) {
        await sleep(backoffMs * 2 ** attempt + Math.random() * 100);
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      // Network error / CORS / DNS — retry with backoff.
      lastErr = err;
      if (attempt >= retries) break;
      await sleep(backoffMs * 2 ** attempt + Math.random() * 100);
      attempt++;
    }
  }

  if (!silent) {
    toast.error("Connection issue", {
      description: "Couldn't reach the server. Please check your connection and try again.",
    });
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network request failed");
}

export async function apiJson<T = unknown>(path: string, init: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (!init.silent) {
      toast.error(`Request failed (${res.status})`, {
        description: text?.slice(0, 140) || res.statusText,
      });
    }
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
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

/** Ping /api/health. Silent (no toast) — used by the diagnostics indicator. */
export async function checkHealth(): Promise<HealthResponse | null> {
  try {
    return await apiJson<HealthResponse>("/health", { silent: true, retries: 1 });
  } catch {
    return null;
  }
}
