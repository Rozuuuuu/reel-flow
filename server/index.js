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
    if (!origin) return cb(null, true);
    if (allowList.has(origin)) return cb(null, true);
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
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// ─── Request correlation ─────────────────────────────────────────────────────
// Echo the client's X-Request-Id (or generate one) on every response so the
// same ID appears in browser toasts, frontend logs, and backend logs.
app.use((req, res, next) => {
  const incoming = req.header("x-request-id");
  const reqId =
    incoming && /^[\w.-]{1,128}$/.test(incoming)
      ? incoming
      : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  req.requestId = reqId;
  res.setHeader("X-Request-Id", reqId);
  next();
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────
const STARTED_AT = new Date().toISOString();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "reel-flow-api",
    time: new Date().toISOString(),
    startedAt: STARTED_AT,
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "dev",
  });
});

// Reports which non-secret env vars are configured. Never returns secret values.
app.get("/api/env", (_req, res) => {
  const keys = [
    "NODE_ENV",
    "PORT",
    "ALLOWED_ORIGINS",
    "RENDER_EXTERNAL_HOSTNAME",
    "RENDER_GIT_COMMIT",
    "RENDER_SERVICE_NAME",
  ];
  const present = {};
  for (const k of keys) present[k] = Boolean(process.env[k]);
  res.json({
    ok: true,
    present,
    allowedOrigins: [...allowList],
    hostname: process.env.RENDER_EXTERNAL_HOSTNAME || null,
    nodeEnv: process.env.NODE_ENV || "development",
  });
});

// Add your real API routes here, e.g.
// app.use("/api/videos", require("./routes/videos"));

// ─── 404 + Error handlers ────────────────────────────────────────────────────
// Always echo the request ID in the JSON body so it matches the X-Request-Id
// header and any client-side log/toast.
app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.originalUrl,
    requestId: req.requestId,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  // eslint-disable-next-line no-console
  console.error(`[${req.requestId}] ${status} ${err.message}`);
  res.status(status).json({
    ok: false,
    error: err.message || "Internal Server Error",
    requestId: req.requestId,
  });
});

// ─── Boot ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`reel-flow-api listening on :${PORT}`);
});
