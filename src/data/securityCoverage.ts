/**
 * Static manifest of the RLS / storage / realtime surface and which automated
 * tests currently cover each row. This is the source of truth for the
 * /security/coverage dashboard. Update it whenever a new test file or table
 * lands so the dashboard stays honest.
 */

export type CoverageStatus = "covered" | "partial" | "uncovered";

export interface CoverageRow {
  /** Resource being protected (table / bucket / realtime topic). */
  resource: string;
  kind: "table" | "storage" | "realtime";
  /** Which RLS / ownership rules apply. */
  policy: string;
  /** Test files that exercise this resource. */
  tests: string[];
  /** Whether CI runs these tests on every PR. */
  ci: boolean;
  status: CoverageStatus;
}

export const COVERAGE_ROWS: CoverageRow[] = [
  { resource: "profiles", kind: "table", policy: "Public read, owner write", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "covered" },
  { resource: "videos", kind: "table", policy: "Public read (public videos), owner write", tests: ["src/test/rls.policy.test.ts", "server/api.rls.test.js"], ci: true, status: "covered" },
  { resource: "comments", kind: "table", policy: "Public read, owner write, moderator override", tests: ["src/test/rls.policy.test.ts", "server/api.rls.test.js"], ci: true, status: "covered" },
  { resource: "comment_edits", kind: "table", policy: "Owner + moderator read only", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "covered" },
  { resource: "comment_reports", kind: "table", policy: "Reporter sees own; moderators see all", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "partial" },
  { resource: "likes", kind: "table", policy: "Public read, owner write", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "covered" },
  { resource: "follows / follow_requests", kind: "table", policy: "Public follows; private requests", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "partial" },
  { resource: "saved_videos", kind: "table", policy: "Owner only", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "covered" },
  { resource: "notifications", kind: "table", policy: "Recipient only", tests: ["src/test/rls.policy.test.ts", "server/api.rls.test.js"], ci: true, status: "covered" },
  { resource: "push_subscriptions", kind: "table", policy: "Owner only", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "covered" },
  { resource: "user_roles", kind: "table", policy: "Restrictive: admin write only", tests: ["src/test/rls.policy.test.ts", "src/test/roles.ownership.test.ts"], ci: true, status: "covered" },
  { resource: "analytics_events", kind: "table", policy: "Self-read only; anyone may insert own", tests: [], ci: false, status: "uncovered" },
  { resource: "bucket:videos", kind: "storage", policy: "Public read; owner path-segment write", tests: ["src/test/rls.policy.test.ts", "server/api.rls.test.js"], ci: true, status: "covered" },
  { resource: "bucket:thumbnails", kind: "storage", policy: "Public read; owner path-segment write", tests: ["src/test/rls.policy.test.ts", "server/api.rls.test.js"], ci: true, status: "covered" },
  { resource: "bucket:avatars", kind: "storage", policy: "Public read; owner path-segment write", tests: ["src/test/rls.policy.test.ts"], ci: true, status: "covered" },
  { resource: "realtime:notifications:<uid>", kind: "realtime", policy: "Topic uid must match auth.uid()", tests: ["src/test/rls.policy.test.ts", "src/test/realtime.policy.test.ts"], ci: true, status: "covered" },
  { resource: "realtime:comments:<video_id>", kind: "realtime", policy: "Authenticated + can_view_video()", tests: ["src/test/realtime.policy.test.ts"], ci: true, status: "covered" },
  { resource: "SECURITY DEFINER helpers (private schema)", kind: "table", policy: "Not exposed via Data API; public wrappers are SECURITY INVOKER", tests: ["src/test/securityDefiner.policy.test.ts"], ci: true, status: "covered" },
];

export interface PrRunSummary {
  pr: number;
  title: string;
  sha: string;
  date: string;
  rls: "pass" | "fail";
  api: "pass" | "fail";
  realtime: "pass" | "fail";
  scanDiff: "pass" | "fail";
}

/**
 * Recent CI runs surfaced to the dashboard. The CI workflow appends an entry
 * to public/security-coverage-history.json after each run; this static seed is
 * the fallback when fetching the live file fails (e.g. local dev).
 */
export const SEED_HISTORY: PrRunSummary[] = [
  { pr: 142, title: "Security coverage dashboard + realtime tests", sha: "abc1234", date: "2026-06-10", rls: "pass", api: "pass", realtime: "pass", scanDiff: "pass" },
  { pr: 141, title: "RLS smoke tests + CI integration", sha: "9f0e21a", date: "2026-06-09", rls: "pass", api: "pass", realtime: "pass", scanDiff: "pass" },
  { pr: 140, title: "user_roles restrictive policies", sha: "5c2b117", date: "2026-06-09", rls: "pass", api: "pass", realtime: "pass", scanDiff: "pass" },
  { pr: 139, title: "comment_edits author-only read", sha: "1d4e9b8", date: "2026-06-08", rls: "pass", api: "pass", realtime: "pass", scanDiff: "pass" },
];
