import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Diagnostics modal — mocked /api/env", () => {
  it("shows the loading state when /api/env is slow", async () => {
    let resolveEnv: (r: Response) => void = () => {};
    const envPromise = new Promise<Response>((r) => (resolveEnv = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/env")) return envPromise;
        if (url.includes("/api/health")) return json(200, { ok: true });
        return new Response(null, { status: 204 });
      }),
    );

    render(<BackendHealthIndicator />);
    fireEvent.click(screen.getByRole("button", { name: /diagnostics/i }));

    expect(await screen.findByTestId("diag-loading")).toBeInTheDocument();
    resolveEnv(json(200, { ok: true, hostname: "h", nodeEnv: "production", allowedOrigins: ["https://x"], present: { NODE_ENV: true } }));
    await waitFor(() => expect(screen.getByTestId("diag-body")).toBeInTheDocument());
  });

  it("shows 'couldn't reach' when /api/env returns 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/env")) return json(503, { ok: false });
        if (url.includes("/api/health")) return json(200, { ok: true });
        return new Response(null, { status: 204 });
      }),
    );

    render(<BackendHealthIndicator />);
    fireEvent.click(screen.getByRole("button", { name: /diagnostics/i }));

    await waitFor(
      () => expect(screen.getByTestId("diag-unreachable")).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("shows missing fields warning when /api/env omits hostname/origins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/env"))
          return json(200, {
            ok: true,
            hostname: null,
            nodeEnv: "production",
            allowedOrigins: [],
            present: { NODE_ENV: true },
          });
        if (url.includes("/api/health")) return json(200, { ok: true });
        return new Response(null, { status: 204 });
      }),
    );

    render(<BackendHealthIndicator />);
    fireEvent.click(screen.getByRole("button", { name: /diagnostics/i }));

    const warn = await screen.findByTestId("diag-missing-fields");
    expect(warn.textContent).toMatch(/hostname/);
    expect(warn.textContent).toMatch(/allowedOrigins/);
  });
});
