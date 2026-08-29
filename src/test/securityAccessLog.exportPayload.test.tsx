/**
 * End-to-end style test: change sort + filters + pagination on
 * /security/access-log, export CSV, then assert the downloaded CSV content
 * corresponds exactly to the query parameters persisted in the export audit
 * payload (sort, dir, page, page_size, scope, filters) — and that both audit
 * rows for the attempt share one correlation/request id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type LogRow = {
  id: string;
  user_id: string | null;
  path: string;
  was_admin: boolean;
  user_agent: string | null;
  created_at: string;
};

const PAGE_SIZE = 50;

// ── Dataset: 120 rows, 60 of them on /security/matrix ───────────────────────
const dataset: LogRow[] = Array.from({ length: 120 }, (_, i) => ({
  id: `row-${String(i).padStart(3, "0")}`,
  user_id: `user-${i % 3}`,
  path: i % 2 === 0 ? `/security/matrix?i=${String(i).padStart(3, "0")}` : `/security/runbook?i=${i}`,
  was_admin: i % 4 !== 0,
  user_agent: "vitest",
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
}));

type Op =
  | { kind: "gte"; col: keyof LogRow; value: string }
  | { kind: "eq"; col: keyof LogRow; value: unknown }
  | { kind: "ilike"; col: keyof LogRow; value: string };

/** Minimal PostgREST-like builder over the in-memory dataset. */
function makeQuery() {
  const ops: Op[] = [];
  let order: { col: keyof LogRow; asc: boolean } | null = null;

  const run = (range?: { from: number; to: number }, limit?: number) => {
    let rows = dataset.filter((r) =>
      ops.every((op) => {
        const v = r[op.col];
        if (op.kind === "gte") return String(v) >= op.value;
        if (op.kind === "eq") return v === op.value;
        const needle = op.value.replace(/%/g, "");
        return String(v).toLowerCase().includes(needle.toLowerCase());
      }),
    );
    if (order) {
      const { col, asc } = order;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    const count = rows.length;
    if (range) rows = rows.slice(range.from, range.to + 1);
    else if (limit) rows = rows.slice(0, limit);
    return Promise.resolve({ data: rows, count, error: null });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {
    select: () => q,
    order: (col: keyof LogRow, opts?: { ascending?: boolean }) => {
      order = { col, asc: opts?.ascending !== false };
      return q;
    },
    gte: (col: keyof LogRow, value: string) => { ops.push({ kind: "gte", col, value }); return q; },
    eq: (col: keyof LogRow, value: unknown) => { ops.push({ kind: "eq", col, value }); return q; },
    ilike: (col: keyof LogRow, value: string) => { ops.push({ kind: "ilike", col, value }); return q; },
    range: (from: number, to: number) => {
      q._pending = { from, to };
      return q;
    },
    limit: (n: number) => { q._limit = n; return q; },
    then: (res: unknown, rej: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run(q._pending, q._limit).then(res as any, rej as any),
  };
  return q;
}

const auditPayloads: Record<string, unknown>[] = [];
const rpcMock = vi.fn(async (name: string, args: { _filters: Record<string, unknown> }) => {
  if (name === "log_security_export") auditPayloads.push(args._filters);
  return { data: null, error: null };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: never) => rpcMock(name, args),
    from: () => makeQuery(),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

let downloadedCsv = "";
beforeEach(() => {
  auditPayloads.length = 0;
  rpcMock.mockClear();
  downloadedCsv = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Blob = class {
    parts: string[];
    constructor(parts: string[]) {
      this.parts = parts;
      downloadedCsv = parts.join("");
    }
  };
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

import SecurityAccessLog from "@/pages/SecurityAccessLog";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SecurityAccessLog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("/security/access-log CSV export matches the audited query params", () => {
  it("persists sort, filter and pagination state that reproduce the CSV exactly", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Sort by Path")).toBeInTheDocument());

    // 1. Filter
    fireEvent.change(screen.getByLabelText("Path contains"), {
      target: { value: "/security/matrix" },
    });
    // 2. Sort by path ascending (first click = desc, second = asc)
    fireEvent.click(screen.getByLabelText("Sort by Path"));
    fireEvent.click(screen.getByLabelText("Sort by Path"));
    // 3. Paginate
    await waitFor(() => expect(screen.getByText("Next")).toBeEnabled());
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => expect(screen.getByText(/Page 2 \//)).toBeInTheDocument());

    // 4. Export
    fireEvent.click(screen.getByTestId("export-csv"));
    await waitFor(() => expect(auditPayloads.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });

    const started = auditPayloads.find((p) => p.outcome === "started")!;
    const succeeded = auditPayloads.find((p) => p.outcome === "succeeded")!;
    expect(started).toMatchObject({
      path: "/security/matrix",
      sort: "path",
      dir: "asc",
      page: 1,
      page_size: PAGE_SIZE,
      scope: "page",
      admin_filter: "any",
    });

    // Correlation id: present, stable across all rows of the attempt
    expect(typeof started.request_id).toBe("string");
    expect((started.request_id as string).length).toBeGreaterThan(8);
    expect(succeeded.request_id).toBe(started.request_id);

    // 5. Re-run the audited query independently and compare with the CSV
    const expected = dataset
      .filter((r) => r.path.includes(started.path as string))
      .filter((r) => r.created_at >= (started.since as string))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .slice(
        (started.page as number) * PAGE_SIZE,
        (started.page as number) * PAGE_SIZE + PAGE_SIZE,
      );

    const lines = downloadedCsv.split("\n");
    expect(lines[0]).toBe("created_at,user_id,path,was_admin,user_agent");
    expect(lines.length - 1).toBe(expected.length);
    expect(succeeded.rows).toBe(expected.length);
    expected.forEach((row, i) => {
      expect(lines[i + 1]).toBe(
        [row.created_at, row.user_id, row.path, row.was_admin, row.user_agent].join(","),
      );
    });
  });
});
