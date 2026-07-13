# Security Runbook

Short operational guide for running the full security suite locally, reading
baseline diffs, and unblocking CI failures. Pair this with:

- `/security` — RLS policy reference (rendered from `src/pages/SecurityPolicy.tsx`)
- `/security/coverage` — live coverage dashboard
- `/security/matrix` — table ↔ policy ↔ SECURITY DEFINER helper map
- `security-fixtures/baseline.json` — accepted-findings baseline

---

## 1. Run the full scan suite locally

Everything below is safe to run on a laptop; no production creds required.

```bash
# 1. Install (frozen lockfile, same as CI)
bun install --frozen-lockfile

# 2. Static checks
bun run lint
bunx tsgo --noEmit

# 3. Unit + RLS + realtime + SECURITY DEFINER tests
bunx vitest run

# 4. End-to-end API RLS tests (Express + Supabase)
node --test server/api.rls.test.js

# 5. Dependency audit (informational — same as CI)
bun audit || true

# 6. Security scan diff against the committed baseline
node scripts/security-scan-diff.mjs \
  --baseline security-fixtures/baseline.json \
  --current  security-fixtures/current.json
```

If `security-fixtures/current.json` is absent the diff treats the scan as
empty (zero findings) and passes. In CI, the scanner writes that file before
the diff step runs.

### Environment

Tests that talk to the live backend read `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`. Without them, RLS/realtime tests
auto-skip. Admin-path SECURITY DEFINER tests additionally require
`TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` and
`TEST_OWNER_EMAIL` / `TEST_OWNER_PASSWORD` (optional — skipped if unset).

---

## 2. Interpret baseline diffs

`scripts/security-scan-diff.mjs` compares `current.json` to
`baseline.json`. Findings are keyed by `${scanner}::${internalId|ruleId|id|title}`.

Exit codes:

| Code | Meaning                                              | Action                             |
| ---- | ---------------------------------------------------- | ---------------------------------- |
| 0    | No new HIGH/CRITICAL findings                        | ✅ Nothing to do                    |
| 1    | ≥1 new HIGH/CRITICAL finding not in the baseline     | Fix it OR justify + baseline it    |
| 2    | Malformed JSON in `current.json` / `baseline.json`   | Fix the file, re-run               |

**When the diff prints a new blocker:**

1. Read the finding: `scanner`, `internalId`, `severity`, `location`.
2. **Fix first.** Ship the code/migration change on the same branch.
3. Only if the risk is genuinely accepted, add an entry to
   `security-fixtures/baseline.json` **in the same PR** with a `justification`
   field explaining *why* it is acceptable, and mention it in the PR
   description. Baseline additions without justification will be rejected in
   review.

Renamed titles do not slip past — the key uses `internalId`/`ruleId` first.

---

## 3. Troubleshoot CI failures

Common failure modes from `.github/workflows/ci.yml`:

### `bunx tsgo --noEmit` fails
- Stale generated types: `bun install --frozen-lockfile` then re-run.
- Missing peer (e.g. `@testing-library/dom` for `screen`): check
  `package.json` includes it, not just a transitive.

### `vitest` fails on RLS / realtime tests
- Missing env: confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
  exist in the CI job env (not just repo secrets). Tests will skip cleanly
  when unset, so a *failure* here means the env was partially set.
- Flake against live backend: re-run once. Persistent failure ⇒ a policy or
  wrapper regressed; check the diff of `supabase/migrations/**`.

### `server/api.rls.test.js` fails
- The Express layer stopped forwarding the caller's JWT. Grep for
  `Authorization` in `server/index.js` and confirm the header is passed
  through to Supabase, not swapped for the service-role key.

### `bun audit` output is noisy
- `bun audit` is run with `|| true` in CI (transitive `vite`/`rollup`/etc.
  advisories are informational). Only `security-scan-diff.mjs` gates the
  build. If you want to gate on audit output, tighten the workflow — do not
  add packages to bypass it.

### `security-scan-diff.mjs` exits 1
- See §2. Never suppress the exit code; fix or baseline with justification.

### Coverage threshold failure
- New component/page added without tests. Either add tests or, if truly not
  security-relevant, exclude the file in `vitest.config.ts` — but never
  exclude anything under `src/test/`, `src/lib/api*`, `src/hooks/useNotifications*`,
  or `src/components/BackendHealthIndicator*`.

---

## 4. Escalation

- **New HIGH/CRITICAL in production:** open a hotfix branch, fix + baseline
  in one PR, tag the security owner in the PR description.
- **Suspected privilege escalation via a SECURITY DEFINER helper:** rotate
  affected sessions, then patch. Helpers live in the `private` schema; the
  Data API only exposes the `public` wrappers (SECURITY INVOKER). See
  `/security/matrix` for the full map.
