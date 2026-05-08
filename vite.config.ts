import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  // Build allowedHosts from env so each Render/preview deploy works without code changes.
  // Supports comma-separated list in VITE_ALLOWED_HOSTS or ALLOWED_HOSTS (e.g. "myapp.onrender.com,staging.example.com").
  const envHosts = (process.env.VITE_ALLOWED_HOSTS || process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  // Render injects RENDER_EXTERNAL_HOSTNAME for the live service hostname.
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME;

  const allowedHosts = Array.from(
    new Set([
      ...envHosts,
      ...(renderHost ? [renderHost] : []),
      "reel-flow.onrender.com",
      ".onrender.com",
      ".lovable.app",
      ".lovable.dev",
      "localhost",
      "127.0.0.1",
    ]),
  );

  return {
    // Use VITE_BASE_PATH to override (e.g. "/" for root, "/app/" for sub-path).
    base: process.env.VITE_BASE_PATH || "/",
    server: {
      host: "::",
      port: Number(process.env.PORT) || 8080,
      allowedHosts,
      hmr: {
        overlay: false,
      },
    },
    preview: {
      host: "::",
      port: Number(process.env.PORT) || 8080,
      allowedHosts,
      // Permissive CORS for preview server so the SPA can call external APIs (Supabase, etc.).
      cors: true,
      headers: {
        // Basic CSP suitable for Render-hosted SPA + Supabase Cloud + common media sources.
        // Override per-deploy with VITE_CSP if needed.
        "Content-Security-Policy":
          process.env.VITE_CSP ||
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.lovable.app https://*.lovable.dev",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: https:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.lovable.app https://*.lovable.dev https://*.onrender.com",
            "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev",
          ].join("; "),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    },
    plugins: [react(), !isProd && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
