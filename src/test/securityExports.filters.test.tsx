/**
 * Integration test for /security/exports: verifies filtering by user, path,
 * time window and outcome returns only the matching `log_security_export`
 * audit entries, and that the details drawer surfaces the exact payload plus
 * the correlation/request id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type LogRow = {
  id: string;
  user_id: string | null;
  path: string;
  user_agent: string | null;
  created_at: string;
};

const EXPORT_PREFIX = "/security/access-log/export?";

const mkRow = (
  id: string,
  user: string,
  payload: Record<string, unknown>,
  ageMinutes: number,
): LogRow => ({
  id,
  user_id: user,
  path: `${EXPORT_PREFIX}${JSON.stringify(payload)}`,
  user_agent: "vitest",
  created_at: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
});

const dataset: LogRow[] = [
  mkRow("a", "user-1", { request_id: "req-a", outcome: "succeeded", path: "/security/matrix", sort: "created_at", dir: "desc", page: 0, page_size: 50, scope: "page", rows: 12 }, 10),
  mkRow("b", "user-2", { request_id: "req-b", outcome: "failed", path: "/security/matrix", error: "boom" }, 20),
  mkRow("c", "user-1", { request_id: "req-c", outcome: "succeeded", path: "/security/runbook", rows: 3 }, 30),
  mkRow("d", "user-3", { request_id: "req-d", outcome: "empty", path: "/security/runbook", rows: 0 }, 60 * 24 * 20),
  // Not an export row at all — must never appear.
  { id: "e", user_id: "user-1", path: "/security/matrix", user_agent: "vitest", created_at: new Date().toISOString() },
];

type Op = { kind: "gte" | "eq" | "ilike"; col: keyof LogRow; value: string | null };

function makeQuery() {
  const ops: Op[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {
    select: () => q,
    order: () => q,
    gte: (col: keyof LogRow, value: string) => { ops.push({ kind: "gte", col, value }); return q; },
    eq: (col: keyof LogRow, value: string) => { ops.push({ kind: "eq", col, value }); return q; },
    ilike: (col: keyof LogRow, value: string) => { ops.push({ kind: "ilike", col, value }); return q; },
    range: (from: number, to: number) => {
      const rows = dataset.filter((r) =>
        ops.every((op) => {
          const v = String(r[op.col] ?? "");
          if (op.kind === "gte") return v >= String(op.value);
          if (op.kind === "eq") return v === op.value;
          const pattern = String(op.value).replace(/\\/g, "");
          const segments = pattern.split("%").filter(Boolean);
          let idx = 0;
          return segments.every((s) => {
            const found = v.indexOf(s, idx);
            if (found === -1) return false;
            idx = found + s.length;
            return true;
          });
        }),
      );
      return Promise.resolve({ data: rows.slice(from, to + 1), count: rows.length, error: null });
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => makeQuery(), rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

import SecurityExports from "@/pages/SecurityExports";

function renderPage(search = "") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/security/exports${search}`]}>
        <SecurityExports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowIds = () =>
  screen
    .getAllByTestId(/^request-id-/)
    .map((el) => el.textContent?.trim())
    .sort();

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks these DOM APIs that Radix Select touches when opened.
  Element.prototype.scrollIntoView = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).hasPointerCapture = vi.fn(() => false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).setPointerCapture = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).releasePointerCapture = vi.fn();
});

describe("/security/exports filtering", () => {
  it("shows only export audit rows inside the default 7-day window", async () => {
    renderPage();
    await waitFor(() => expect(rowIds()).toEqual(["req-a", "req-b", "req-c"]));
  });

  it("filters by user id via URL query params", async () => {
    renderPage("?user=user-1");
    await waitFor(() => expect(rowIds()).toEqual(["req-a", "req-c"]));
  });

  it("filters by path substring via URL query params", async () => {
    renderPage("?path=/security/runbook");
    await waitFor(() => expect(rowIds()).toEqual(["req-c"]));
  });

  it("typing a user filter pushes it into the URL and refilters", async () => {
    renderPage();
    await waitFor(() => expect(rowIds().length).toBe(3));
    fireEvent.change(screen.getByLabelText("User ID"), { target: { value: "user-1" } });
    await waitFor(() => expect(rowIds()).toEqual(["req-a", "req-c"]));
  });

  it("filters by outcome via URL query params", async () => {
    renderPage("?outcome=failed");
    await waitFor(() => expect(rowIds()).toEqual(["req-b"]));
  });

  it("widening the time window via URL query params reveals older entries", async () => {
    renderPage("?hours=720");
    await waitFor(() => expect(rowIds()).toEqual(["req-a", "req-b", "req-c", "req-d"]));
  });

  it("combines user, path and outcome params", async () => {
    renderPage("?user=user-1&path=/security/runbook&outcome=succeeded");
    await waitFor(() => expect(rowIds()).toEqual(["req-c"]));
  });

  it("pagination page param is applied to the query range", async () => {
    renderPage("?page=1");
    await waitFor(() =>
      expect(screen.getByText("No export attempts match these filters.")).toBeInTheDocument(),
    );
  });

  it("details drawer shows the exact audit payload and request id", async () => {
    renderPage();
    await waitFor(() => expect(rowIds().length).toBe(3));
    fireEvent.click(screen.getByTestId("details-a"));
    const details = await screen.findByTestId("export-details");
    expect(within(details).getByText("req-a")).toBeInTheDocument();
    expect(within(details).getByText("succeeded")).toBeInTheDocument();
    expect(within(details).getByText("created_at desc")).toBeInTheDocument();
    expect(within(details).getByText(/page 1 ·/)).toBeInTheDocument();
    const json = JSON.parse(screen.getByTestId("export-details-json").textContent ?? "{}");
    expect(json).toMatchObject({
      request_id: "req-a",
      outcome: "succeeded",
      path: "/security/matrix",
      scope: "page",
      page_size: 50,
      rows: 12,
    });
  });
});
