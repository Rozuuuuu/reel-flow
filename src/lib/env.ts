/**
 * Centralised env access + startup validation.
 *
 * Required vars are checked at boot; if any are missing the app renders a
 * clear error screen instead of crashing deep in the React tree.
 */

export interface AppEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_PROJECT_ID: string;
  /** Base URL for the Node/Express API. Defaults to "/api" so Render's
   *  reverse-proxy rule can forward same-origin requests to the backend. */
  API_URL: string;
}

export interface EnvValidationResult {
  ok: boolean;
  env: Partial<AppEnv>;
  missing: string[];
}

const REQUIRED: (keyof AppEnv)[] = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_ID",
];

export function validateEnv(): EnvValidationResult {
  const raw = {
    SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    API_URL: import.meta.env.VITE_API_URL || "/api",
  } as Partial<AppEnv>;

  const missing = REQUIRED.filter((k) => !raw[k] || String(raw[k]).trim() === "");

  return { ok: missing.length === 0, env: raw, missing };
}

let cached: AppEnv | null = null;

/** Get the validated env. Throws if called before validation passes. */
export function env(): AppEnv {
  if (cached) return cached;
  const r = validateEnv();
  if (!r.ok) {
    throw new Error(`Missing required env vars: ${r.missing.join(", ")}`);
  }
  cached = r.env as AppEnv;
  return cached;
}
