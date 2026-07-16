/**
 * Integration test for the /security/runbook route.
 *
 * Verifies that the raw runbook markdown CANNOT be read from the client
 * unless the caller is an admin:
 *
 *  - Anonymous users are redirected to /auth by <RequireAdmin>.
 *  - Signed-in non-admin users see the "Admins only" rejection screen and
 *    the runbook edge function is either not invoked or returns 403 — the
 *    raw markdown never appears in the DOM.
 *  - Signed-in admin users see the runbook content served by the
 *    `security-runbook` edge function.
 *
 * The Supabase client and AuthContext are mocked so this runs offline in CI.
 * The important guarantee is that in every non-admin scenario, the runbook's
 * unique marker string never lands in the rendered output.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const RUNBOOK_MARKER = "TOP_SECRET_RUNBOOK_CONTENT_MARKER";

const rpcMock = vi.fn();
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const authState: { user: { id: string } | null; loading: boolean } = {
  user: null,
  loading: false,
};
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import AFTER mocks
import { RequireAdmin } from "@/components/RequireAdmin";
import SecurityRunbook from "@/pages/SecurityRunbook";

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/security/runbook"]}>
      <Routes>
        <Route path="/auth" element={<div>AUTH_PAGE</div>} />
        <Route
          path="/security/runbook"
          element={
            <RequireAdmin>
              <SecurityRunbook />
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/security/runbook access gate", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invokeMock.mockReset();
    authState.user = null;
    authState.loading = false;
  });

  it("redirects anonymous users to /auth without fetching runbook", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("AUTH_PAGE")).toBeInTheDocument());
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByText(new RegExp(RUNBOOK_MARKER))).toBeNull();
  });

  it("blocks non-admins even if the edge function is somehow invoked", async () => {
    authState.user = { id: "user-not-admin" };
    rpcMock.mockImplementation((name: string) => {
      if (name === "has_role") return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    // Simulate the edge function correctly refusing a non-admin caller.
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "admin_required", status: 403 },
    });

    renderRoute();
    await waitFor(() => expect(screen.getByText(/Admins only/i)).toBeInTheDocument());
    // The runbook body must never be rendered for a non-admin.
    expect(screen.queryByText(new RegExp(RUNBOOK_MARKER))).toBeNull();
  });

  it("renders runbook markdown for admins via the edge function", async () => {
    authState.user = { id: "user-admin" };
    rpcMock.mockImplementation((name: string) => {
      if (name === "has_role") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const markdown = `# Runbook\n${RUNBOOK_MARKER}\n- step 1`;
    invokeMock.mockResolvedValue({ data: markdown, error: null });

    renderRoute();
    await waitFor(() =>
      expect(screen.getByText(new RegExp(RUNBOOK_MARKER))).toBeInTheDocument(),
    );
    // Confirm the server-side edge function was the delivery path — the raw
    // markdown must never be bundled into the client.
    expect(invokeMock).toHaveBeenCalledWith("security-runbook", expect.any(Object));
  });
});
