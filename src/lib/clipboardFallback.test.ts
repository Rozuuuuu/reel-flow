import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  env: () => ({
    SUPABASE_URL: "http://x",
    SUPABASE_PUBLISHABLE_KEY: "k",
    SUPABASE_PROJECT_ID: "p",
    API_URL: "/api",
  }),
}));

const toastError = vi.fn();
const toastMessage = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: toastError, message: toastMessage },
}));

import { apiJson, copyToClipboard } from "./api";

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  toastError.mockClear();
  toastMessage.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clipboard fallback surfaces the request correlation ID", () => {
  it("copyToClipboard returns false when navigator.clipboard is unavailable", async () => {
    // Force clipboard absence.
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    const result = await copyToClipboard("hello");
    expect(result).toBe(false);
  });

  it("copyToClipboard returns false when writeText throws", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error("denied")),
        },
      },
    });
    const result = await copyToClipboard("hello");
    expect(result).toBe(false);
  });

  it("failure toast 'Copy ID' action falls back to toast.message with the ID when clipboard fails", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error("denied")),
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, {})));

    const err = await apiJson("/x", { retries: 0, requestId: "req_abc_123" }).catch(
      (e) => e,
    );
    expect(err).toBeDefined();

    // Failure toast was raised and includes the ID in its description.
    expect(toastError).toHaveBeenCalledTimes(1);
    const [, opts] = toastError.mock.calls[0];
    expect(opts.description).toContain("req_abc_123");

    // Trigger the action — clipboard fails → toast.message fallback with the ID.
    await opts.action.onClick();
    expect(toastMessage).toHaveBeenCalledTimes(1);
    const [, msgOpts] = toastMessage.mock.calls[0];
    expect(msgOpts.description).toBe("req_abc_123");
  });
});
