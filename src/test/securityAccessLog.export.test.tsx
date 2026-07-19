/**
 * Integration test: CSV export from /security/access-log records an audit row
 * in `security_access_log` via the `log_security_export` RPC.
 *
 * We stand up an in-memory table that mimics the DB behavior: the RPC insert
 * writes a row with a computed `path` reflecting the export filters. Then we
 * assert the RPC was called with the expected filter payload + `user_agent`,
 * and that a corresponding row exists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── In-memory `security_access_log` ──────────────────────────────────────────
type LogRow = {
  id: string;
  user_id: string | null;
  path: string;
  was_admin: boolean;
  user_agent: string | null;
  created_at: string;
};
const auditRows: LogRow[] = [];

// Existing rows returned by the table query (unrelated to the export audit)
const seedRows: LogRow[] = [
  {
    id: "r1",
    user_id: "user-a",
    path: "/security/matrix",
    was_admin: true,
    user_agent: "vitest",
    created_at: new Date().toISOString(),
  },
];

// Chainable query builder used for both the table SELECT and the export SELECT.
function makeQuery(rows: LogRow[]) {
  const q: any = {
    _rows: rows,
    select: () => q,
    order: () => q,
    range: () => Promise.resolve({ data: q._rows, count: q._rows.length, error: null }),
    limit: () => Promise.resolve({ data: q._rows, error: null }),
    gte: () => q,
    eq: () => q,
    ilike: () => q,
  };
  return q;
}

const rpcMock = vi.fn(async (name: string, args: any) => {
  if (name === "log_security_export") {
    auditRows.push({
      id: `audit-${auditRows.length + 1}`,
      user_id: "admin-user",
      path: `/security/access-log/export?path=${args._filters.path ?? ""}&admin=${args._filters.admin_filter}`,
      was_admin: true,
      user_agent: args._user_agent,
      created_at: new Date().toISOString(),
    });
    return { data: null, error: null };
  }
  return { data: null, error: null };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: any) => rpcMock(name, args),
    from: () => makeQuery(seedRows),
  },
}));

// Silence toast side effects
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

// Stub URL/anchor for jsdom
beforeEach(() => {
  auditRows.length = 0;
  rpcMock.mockClear();
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

describe("/security/access-log CSV export audit", () => {
  it("writes a log_security_export row with the filter payload and user_agent", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "test-agent/1.0",
      configurable: true,
    });

    renderPage();

    // Wait for table load
    await waitFor(() => expect(screen.getByText("/security/matrix")).toBeInTheDocument());

    // Fill path filter so the audited payload carries it
    fireEvent.change(screen.getByLabelText("Path contains"), {
      target: { value: "/security/matrix" },
    });

    // Click export
    fireEvent.click(screen.getByTestId("export-csv"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());

    // Assert RPC arguments
    const call = rpcMock.mock.calls.find(([n]) => n === "log_security_export");
    expect(call).toBeDefined();
    const [, args] = call!;
    expect(args._filters).toMatchObject({
      path: "/security/matrix",
      admin_filter: "any",
    });
    expect(args._filters.since).toMatch(/T.*Z$/); // ISO timestamp
    expect(args._user_agent).toBe("test-agent/1.0");

    // Assert audit row landed in the in-memory table
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].path).toContain("/security/access-log/export");
    expect(auditRows[0].path).toContain("path=/security/matrix");
    expect(auditRows[0].user_agent).toBe("test-agent/1.0");
  });
});
