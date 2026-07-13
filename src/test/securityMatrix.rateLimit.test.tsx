/**
 * Rate-limit integration test for /security/matrix.
 *
 * Verifies:
 *  - When the `security_matrix_access_check` RPC returns a
 *    `rate_limit_exceeded` error for a given user, the page shows the
 *    friendly banner with a retry hint (seconds until the next minute).
 *  - The rate-limit state is per-user: switching to a different user id
 *    that is NOT throttled renders the matrix cleanly with no banner.
 *  - The banner countdown decrements over time.
 *
 * The RPC and auth context are mocked so the test runs offline in CI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
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

/**
 * Per-user throttle simulator matching the DB behavior:
 * `security_matrix_access_check` counts hits/minute and returns
 * `rate_limit_exceeded` once the cap is passed. Different users have
 * independent buckets — throttling one MUST NOT throttle another.
 */
function makeThrottler(limitPerMinute: number) {
  const hits = new Map<string, number>();
  return (userId: string) => {
    const n = (hits.get(userId) ?? 0) + 1;
    hits.set(userId, n);
    if (n > limitPerMinute) {
      return {
        data: null,
        error: {
          message: "rate_limit_exceeded: bucket=security_matrix_access limit=60/min",
          details: "",
          code: "P0001",
        },
      };
    }
    return { data: true, error: null };
  };
}

describe("/security/matrix rate limiting", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    authState.user = null;
    authState.loading = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Freeze the clock inside a minute so the countdown is deterministic.
    vi.setSystemTime(new Date("2026-07-13T12:00:15.000Z")); // 45s remaining
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the rate-limit banner with a retry hint when the RPC returns rate_limit_exceeded", async () => {
    authState.user = { id: "throttled-user" };
    const throttle = makeThrottler(60);

    rpcMock.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === "has_role") return Promise.resolve({ data: true, error: null });
      if (name === "security_matrix_access_check") {
        // Pretend the user has already burned their quota this minute.
        for (let i = 0; i < 60; i++) throttle(String(args?._user_agent ?? "throttled-user"));
        return Promise.resolve(throttle("throttled-user"));
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderRoute();

    const banner = await screen.findByTestId("rate-limit-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/rate-limited/i);
    // Clock is fixed at :15 — retry hint should read 45s.
    expect(banner).toHaveTextContent(/45s/);

    // Countdown decrements once the interval fires.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(banner).toHaveTextContent(/44s/);

    // Matrix chrome still renders (banner is additive, not a blocker).
    expect(screen.getByRole("heading", { name: /Coverage matrix/i })).toBeInTheDocument();
  });

  it("does NOT show the banner for a different, un-throttled user", async () => {
    authState.user = { id: "fresh-user" };

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
    expect(screen.queryByTestId("rate-limit-banner")).toBeNull();
  });

  it("keeps per-user buckets independent: throttled user is blocked, other user is not", async () => {
    const throttle = makeThrottler(60);
    // Prime the throttle so `alice` is over the limit but `bob` is fresh.
    for (let i = 0; i < 60; i++) throttle("alice");

    rpcMock.mockImplementation((_name: string, _args: Record<string, unknown>) => {
      if (_name === "has_role") return Promise.resolve({ data: true, error: null });
      if (_name === "security_matrix_access_check") {
        const uid = authState.user?.id ?? "";
        return Promise.resolve(throttle(uid));
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Alice — should see the banner.
    authState.user = { id: "alice" };
    const { unmount } = renderRoute();
    expect(await screen.findByTestId("rate-limit-banner")).toBeInTheDocument();
    unmount();

    // Bob — different bucket, no banner.
    authState.user = { id: "bob" };
    renderRoute();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Coverage matrix/i })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("rate-limit-banner")).toBeNull();
  });
});
