/**
 * Minimal Node/Express backend deployed as the `reel-flow-api` service in
 * render.yaml. The frontend reaches it same-origin via Render's /api/* rewrite,
 * so under normal use no cross-origin request is made — but CORS is still
 * configured here for direct calls (curl, mobile apps, custom domains, etc.).
 */
const express = require("express");
const cors = require("cors");

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// Allowlist comes from ALLOWED_ORIGINS (comma-separated), plus sensible
// defaults for local dev and the Render hostname.
const allowList = new Set(
  [
    ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()),
    "https://reel-flow.onrender.com",
    "http://localhost:8080",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
  ].filter(Boolean),
);

const corsOptions = {
  origin(origin, cb) {
    // Same-origin / curl / server-to-server requests have no Origin header.
    if (!origin) return cb(null, true);
    if (allowList.has(origin)) return cb(null, true);
    // Allow any *.onrender.com and *.lovable.app subdomain.
    try {
      const { hostname } = new URL(origin);
      if (/\.onrender\.com$/.test(hostname) || /\.lovable\.(app|dev)$/.test(hostname)) {
        return cb(null, true);
      }
    } catch {
      /* fall through */
    }
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
// Explicit preflight handler for every route.
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "reel-flow-api", time: new Date().toISOString() });
});

// Add your real API routes here, e.g.
// app.use("/api/videos", require("./routes/videos"));

// ─── Boot ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`reel-flow-api listening on :${PORT}`);
});
