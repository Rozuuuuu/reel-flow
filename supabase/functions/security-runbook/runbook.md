# Security Runbook

Operational guide for running the security suite, reading baseline diffs, and
unblocking CI. Last verified end-to-end on **2026-09-04** against the live
backend (results recorded in `/security/dashboard`).

Companion surfaces:

- `/security` — RLS policy reference (`src/pages/SecurityPolicy.tsx`)
- `/security/coverage` — test coverage per table / bucket / realtime topic
- `/security/matrix` — table ↔ policy ↔ SECURITY DEFINER helper map (admin only)
- `/security/dashboard` — pending scans, open issues, timeline of runs (admin only)
- `/security/access-log` — who viewed the matrix / runbook / ran a scan
- `/security/exports` — CSV export audit trail
- `security-fixtures/baseline.json` — accepted-findings baseline

---

## 1. Run the full scan suite

Every step below is safe on a laptop; none require production credentials.

```bash
# 0. Install (frozen lockfile, identical to CI)
bun install --frozen-lockfile

# 1. Static checks
bun run lint
bunx tsc -p tsconfig.app.json --noEmit

# 2. Full test suite (unit + RLS + realtime + roles + scan-diff contract)
bunx vitest run --coverage

# 3. SECURITY DEFINER admin/owner reachability gate (isolated, same as CI)
bunx vitest run \
  src/test/securityDefiner.policy.test.ts \
  src/test/securityDefiner.admin.policy.test.ts --reporter=verbose

# 4. End-to-end API RLS tests (Express + backend)
cd server && npm install --no-audit --no-fund && node --test api.rls.test.js; cd ..

# 5. Dependency audit (informational — non-gating, same as CI)
bun audit --audit-level=high || true

# 6. Baseline diff (gating)
node scripts/security-scan-diff.mjs \
  --baseline security-fixtures/baseline.json \
  --current  security-fixtures/current.json

# 7. Playwright layout/overlap regression
bunx playwright install --with-deps chromium
bunx playwright test
```

Backend-side scans (run from the Lovable agent, not the shell):

| Scan | What it covers | 2026-09-04 result |
| --- | --- | --- |
| `run_security_scan` | Exposed data, missing RLS, misconfiguration | 0 findings |
| `linter` | Postgres security/performance advisories | 0 findings |
| `scripts/security-scan-diff.mjs` | New high/critical vs. baseline | pass (baseline=0, current=0) |
| SECURITY DEFINER vitest gate | Private-schema sealing, wrapper privileges | 6 passed / 6 skipped |

### Record the run

After a suite finishes, log it so `/security/dashboard` and the access log stay
truthful. Admin session required; the RPC also writes a
`/security/scan?...` row into `security_access_log`:

```ts
await supabase.rpc("log_security_scan", {
  _scanner: "security-scan-diff",
  _status: "completed",              // pending | running | completed | failed
  _suite: "baseline-diff",
  _findings_total: 0,
  _findings_high: 0,
  _findings_critical: 0,
  _open_issues: 0,
  _baseline_diff: "pass",            // pass | fail | skipped
  _notes: "baseline=0 current=0",
  _details: { exit_code: 0 },
  _user_agent: navigator.userAgent,
});
```

### Environment

Live-backend tests read `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
from `.env`; without them RLS/realtime tests **skip cleanly** rather than fail.

The admin/owner reachability cases additionally need:

| Variable | Purpose |
| --- | --- |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | Signs in a user holding `app_role = 'admin'` |
| `TEST_OWNER_EMAIL` / `TEST_OWNER_PASSWORD` | Signs in a non-admin video owner |
| `TEST_OWNER_VIDEO_ID` | A private video owned by that user, for `can_view_video` |

Without them the 6 admin/owner cases report as `↓ skipped` — that is expected
locally and is tracked as the one **pending** scan on the dashboard. It is not
a failure, but it also is **not** coverage: only a CI run with those secrets
proves admin reachability end-to-end.

---

## 2. Interpret baseline diffs

`scripts/security-scan-diff.mjs` compares `security-fixtures/current.json`
against `security-fixtures/baseline.json`. Findings are keyed by
`${scanner}::${internalId || ruleId || id || title}`, so a renamed title cannot
slip past the gate.

Exit codes:

| Code | Meaning | Action |
| ---- | ------- | ------ |
| 0 | No new HIGH/CRITICAL findings | Nothing to do |
| 1 | ≥1 new HIGH/CRITICAL finding not in the baseline | Fix, or justify + baseline it |
| 2 | Malformed JSON in either file | Repair the JSON, re-run |

Only `high` and `critical` severities gate; `medium`/`low` are reported by the
scanner but never fail the diff.

If `current.json` is absent the diff treats the scan as empty and passes — CI
writes that file before the diff step, so a missing file locally is normal.

**When a new blocker appears:**

1. Read `scanner`, `internalId`, `severity`, `location`.
2. Cross-check the affected resource on `/security/matrix`: which policy and
   which `private.*` SECURITY DEFINER helper guard it? A finding on a table
   whose matrix row lists no wrapper usually means a missing policy; a finding
   on a helper means the wrapper or its GRANTs regressed.
3. **Fix first** — ship the code or migration change on the same branch.
4. Only if the risk is genuinely accepted, add an entry to
   `security-fixtures/baseline.json` in the same PR with a `justification`
   field, and call it out in the PR description. Unjustified baseline
   additions are rejected in review.

Matrix ↔ baseline reconciliation on 2026-09-04: baseline holds 0 accepted
findings and the live scan returned 0 findings, so every matrix row is backed
by an active policy with no accepted exceptions outstanding.

---

## 3. Troubleshoot CI failures

Failure modes from `.github/workflows/ci.yml`, in the order the job runs them.

### Typecheck fails
- Stale generated types: `bun install --frozen-lockfile`, re-run.
- Missing peer (e.g. `@testing-library/dom` for `screen`): must be a direct
  dependency in `package.json`, not just transitive.

### `vitest` fails on RLS / realtime tests
- Partially set env: tests skip when both Supabase vars are unset, so a
  *failure* means one is set and the other is not. Fix the job env.
- Flake against the live backend: re-run once. Persistent failure means a
  policy or wrapper regressed — check `git diff supabase/migrations/**`.

### SECURITY DEFINER reachability gate fails
- `has_role` returning false for the admin: the seed admin lost its
  `user_roles` row, or `private.has_role` lost `SET search_path = public`.
- A `private.*` RPC unexpectedly succeeding: someone re-granted EXECUTE on the
  private schema. Revoke it; the Data API must only see the `public`
  SECURITY INVOKER wrappers.
- Rate limiting: repeated local runs can trip `private.enforce_rate_limit`
  (`security_matrix`, `security_export`, `security_scan` buckets). Wait for the
  window to roll over rather than raising limits.

### `server/api.rls.test.js` fails
- The Express layer stopped forwarding the caller's JWT. Grep `Authorization`
  in `server/index.js` and confirm the header is passed through instead of
  being swapped for a service-role key.

### `bun audit` noise
- Runs with `|| true`; transitive `vite`/`rollup`/`jsdom` advisories are
  informational. Only the scan diff gates. Do not add packages to silence it.

### `security-scan-diff.mjs` exits 1
- See §2. Never suppress the exit code.

### Coverage threshold failure
- A new component/page landed without tests. Add tests, or exclude the file in
  `vitest.config.ts` — but never exclude anything under `src/test/`,
  `src/lib/api*`, `src/hooks/useNotifications*`, or
  `src/components/BackendHealthIndicator*`.

### Playwright step fails
- Usually a real layout regression in the feed dock. Download the
  `playwright-report` artifact and compare screenshots before touching the test.

---

## 4. Escalation

- **New HIGH/CRITICAL in production:** hotfix branch, fix + baseline in one PR,
  tag the security owner in the description, then log a `failed` scan row via
  `log_security_scan` so the dashboard reflects reality.
- **Suspected privilege escalation through a SECURITY DEFINER helper:** rotate
  affected sessions first, then patch. Helpers live in the `private` schema;
  the Data API exposes only `public` SECURITY INVOKER wrappers. See
  `/security/matrix` for the full map.
- **Audit questions ("who saw this?"):** `/security/access-log` records matrix
  views, runbook fetches and scan runs; `/security/exports` records every CSV
  export attempt with a request id.
