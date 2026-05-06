import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["reel-flow.onrender.com", ".onrender.com", ".lovable.app", "localhost"],
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    port: Number(process.env.PORT) || 8080,
    allowedHosts: ["reel-flow.onrender.com", ".onrender.com", ".lovable.app", "localhost"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
