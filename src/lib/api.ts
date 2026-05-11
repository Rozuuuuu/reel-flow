/**
 * Thin fetch wrapper that always targets VITE_API_URL (default "/api").
 *
 * Using a relative default lets Render's reverse-proxy forward /api/* to the
 * backend service so the browser stays same-origin and CORS is a non-issue.
 * Override with VITE_API_URL=https://api.example.com for direct cross-origin.
 */
import { env } from "./env";

function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = env().API_URL;
  const url = joinUrl(base, path);
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function apiUrl(path = ""): string {
  return joinUrl(env().API_URL, path);
}
