/**
 * Integration test for the /security/matrix route access gate.
 *
 * Verifies:
 *  - Anonymous users are redirected to /auth.
 *  - Signed-in non-admin users see the "Admins only" server-authoritative
 *    rejection screen and NEVER see the matrix content.
 *  - Signed-in admin users render the matrix ("Coverage matrix" heading).
 *
 * The Supabase client and AuthContext are mocked so this runs offline in CI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
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
import SecurityMatrix from "@/pages/SecurityMatrix";

function renderRoute() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/security/matrix"]}>
        <Routes>
          <Route path="/auth" element={<div>AUTH_PAGE</div>} />
          <Route
            path="/security/matrix"
            element={
              <RequireAdmin>
                <SecurityMatrix />
              </RequireAdmin>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("/security/matrix access gate", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    authState.user = null;
    authState.loading = false;
  });

  it("redirects anonymous users to /auth", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("AUTH_PAGE")).toBeInTheDocument());
    expect(screen.queryByText(/Coverage matrix/i)).toBeNull();
  });

  it("shows Admins-only rejection for signed-in non-admins", async () => {
    authState.user = { id: "user-not-admin" };
    rpcMock.mockImplementation((name: string) => {
      if (name === "has_role") return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    renderRoute();
    await waitFor(() => expect(screen.getByText(/Admins only/i)).toBeInTheDocument());
    expect(screen.queryByText(/Coverage matrix/i)).toBeNull();
  });

  it("renders the matrix for signed-in admins and calls the access-log RPC", async () => {
    authState.user = { id: "user-admin" };
    rpcMock.mockImplementation((name: string) => {
      if (name === "has_role") return Promise.resolve({ data: true, error: null });
      if (name === "security_matrix_access_check")
        return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    renderRoute();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Coverage matrix/i })).toBeInTheDocument(),
    );
    // Server-side access log RPC must be invoked on mount
    await waitFor(() =>
      expect(
        rpcMock.mock.calls.some(([name]) => name === "security_matrix_access_check"),
      ).toBe(true),
    );
  });
});
