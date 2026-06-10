/**
 * Unit test for scripts/security-scan-diff.mjs.
 *
 * Spawns the script with synthetic baseline + current fixtures and asserts
 * that it exits 0 when no new high/critical issues exist, and 1 when a new
 * one is introduced. This is the contract CI relies on to fail PRs.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const writeFixture = (dir: string, name: string, body: unknown) => {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(body));
  return p;
};

const runDiff = (baseline: string, current: string) =>
  spawnSync(
    "node",
    ["scripts/security-scan-diff.mjs", "--baseline", baseline, "--current", current],
    { encoding: "utf8" },
  );

describe("security-scan-diff", () => {
  it("passes when current matches baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-"));
    const baseline = writeFixture(dir, "b.json", {
      findings: [{ scanner: "wiz", internalId: "W-1", severity: "high", title: "x" }],
    });
    const current = writeFixture(dir, "c.json", {
      findings: [{ scanner: "wiz", internalId: "W-1", severity: "high", title: "x" }],
    });
    const r = runDiff(baseline, current);
    expect(r.status).toBe(0);
  });

  it("passes when only low/medium findings are new", () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-"));
    const baseline = writeFixture(dir, "b.json", { findings: [] });
    const current = writeFixture(dir, "c.json", {
      findings: [{ scanner: "lovable", internalId: "L-9", severity: "medium", title: "y" }],
    });
    expect(runDiff(baseline, current).status).toBe(0);
  });

  it("fails when a new high/critical finding appears", () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-"));
    const baseline = writeFixture(dir, "b.json", { findings: [] });
    const current = writeFixture(dir, "c.json", {
      findings: [
        { scanner: "wiz", internalId: "W-NEW", severity: "critical", title: "RCE" },
      ],
    });
    const r = runDiff(baseline, current);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("W-NEW");
  });

  it("treats renamed/regressed findings as new (composite key)", () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-"));
    const baseline = writeFixture(dir, "b.json", {
      findings: [{ scanner: "wiz", internalId: "W-1", severity: "high", title: "old name" }],
    });
    const current = writeFixture(dir, "c.json", {
      findings: [{ scanner: "wiz", internalId: "W-2", severity: "high", title: "regressed" }],
    });
    expect(runDiff(baseline, current).status).toBe(1);
  });
});
