import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/env", () => ({
  env: () => ({
    SUPABASE_URL: "http://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "anon",
    SUPABASE_PROJECT_ID: "p",
    API_URL: "/api",
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn() } }));

import { BackendHealthIndicator } from "./BackendHealthIndicator";

function ok(body: unknown = { ok: true, time: "2026-05-19T00:00:00Z" }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function fail(status = 503) {
  return new Response(JSON.stringify({ ok: false }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BackendHealthIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows checking initially then OK after /api/health resolves", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return ok();
      return new Response(null, { status: 204 }); // edge OPTIONS
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BackendHealthIndicator />);
    expect(screen.getByText(/Backend…/)).toBeInTheDocument();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => expect(screen.getByText("Backend")).toBeInTheDocument());
    expect(screen.getByText("Edge")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows Backend ✕ when /api/health persistently fails (after retry)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return fail(503);
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BackendHealthIndicator />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() => expect(screen.getByText(/Backend ✕/)).toBeInTheDocument());
    // checkHealth uses retries:1 → initial + 1 retry = 2 calls
    const healthCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/health"));
    expect(healthCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("re-runs both checks when Refresh status is clicked", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/health")) return ok();
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BackendHealthIndicator />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const before = fetchMock.mock.calls.length;

    const btn = screen.getByRole("button", { name: /refresh status/i });
    await act(async () => {
      btn.click();
      await vi.runAllTimersAsync();
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });
});
