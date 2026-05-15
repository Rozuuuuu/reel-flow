import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub env before importing the module under test.
vi.mock("./env", () => ({
  env: () => ({
    SUPABASE_URL: "http://x",
    SUPABASE_PUBLISHABLE_KEY: "k",
    SUPABASE_PROJECT_ID: "p",
    API_URL: "/api",
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { apiFetch, apiJson, ApiError, makeRequestId } from "./api";
import { toast } from "sonner";

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("makeRequestId", () => {
  it("returns unique req_ ids", () => {
    const a = makeRequestId();
    const b = makeRequestId();
    expect(a).toMatch(/^req_/);
    expect(a).not.toBe(b);
  });
});

describe("apiFetch retry/backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries on 503 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(502))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch("/x", { retries: 3, backoffMs: 10 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(200);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("retries on network error then resolves", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch("/x", { retries: 3, backoffMs: 5 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.ok).toBe(true);
  });

  it("gives up after retries on persistent 502 and returns last response (not error)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch("/x", { retries: 2, backoffMs: 1 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(res.status).toBe(502);
  });

  it("throws ApiError with requestId after persistent network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch("/x", { retries: 2, backoffMs: 1 }).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).requestId).toMatch(/^req_/);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on non-transient 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("/x", { retries: 3, backoffMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });

  it("sends the X-Request-Id header and reuses provided id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/x", { requestId: "req_test_123" });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Request-Id"]).toBe("req_test_123");
  });

  it("silent option suppresses failure toast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fail")));
    await apiFetch("/x", { retries: 0, silent: true }).catch(() => {});
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("apiJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("throws ApiError carrying status and requestId on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { error: "x" })));
    const err = await apiJson("/x", { retries: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).requestId).toMatch(/^req_/);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
