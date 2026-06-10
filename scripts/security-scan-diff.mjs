#!/usr/bin/env node
/**
 * Security scan diff.
 *
 * Compares the latest scan output (current.json — produced by the CI step that
 * fetches results from the security scanner / Wiz / connector scanner) against
 * the committed baseline (security-fixtures/baseline.json). Exits non-zero if
 * any new HIGH or CRITICAL finding appears that is not already in the
 * baseline.
 *
 * A "finding" is identified by `${scanner}::${internalId || ruleId || title}`
 * so renamed titles do not silently slip past the diff.
 *
 * Usage:
 *   node scripts/security-scan-diff.mjs [--current path] [--baseline path]
 *
 * If --current is omitted and no file exists, the script treats it as an empty
 * scan (zero findings) — useful while the CI fetch is not yet wired up.
 */
import { readFileSync, existsSync } from "node:fs";
import { argv, exit } from "node:process";

const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

const baselinePath = arg("--baseline", "security-fixtures/baseline.json");
const currentPath = arg("--current", "security-fixtures/current.json");

const load = (p, fallback) => {
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`Failed to parse ${p}:`, e.message);
    exit(2);
  }
};

const baseline = load(baselinePath, { findings: [] });
const current = load(currentPath, { findings: [] });

const key = (f) =>
  `${f.scanner || "unknown"}::${f.internalId || f.ruleId || f.id || f.title || "?"}`;
const isBlocking = (f) =>
  String(f.severity || "").toLowerCase() === "high" ||
  String(f.severity || "").toLowerCase() === "critical";

const known = new Set((baseline.findings || []).map(key));
const newBlockers = (current.findings || []).filter((f) => isBlocking(f) && !known.has(key(f)));

if (newBlockers.length === 0) {
  console.log(
    `✓ security-scan-diff: no new high/critical findings (baseline=${baseline.findings?.length ?? 0}, current=${current.findings?.length ?? 0}).`,
  );
  exit(0);
}

console.error(`✗ security-scan-diff: ${newBlockers.length} new high/critical finding(s):`);
for (const f of newBlockers) {
  console.error(`  - [${f.severity}] ${f.scanner}: ${f.title || f.ruleId || f.id}`);
  if (f.location) console.error(`      at ${f.location}`);
}
console.error(
  "\nIf these are accepted risks, add them to security-fixtures/baseline.json with justification.",
);
exit(1);
