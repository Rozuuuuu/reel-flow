import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiagnosticsBody } from "./BackendHealthIndicator";
import type { EnvDiagnosticsResponse } from "@/lib/api";

describe("DiagnosticsBody — /api/env modal states", () => {
  it("shows the loading indicator while diag is loading", () => {
    render(<DiagnosticsBody loading={true} diag={null} />);
    expect(screen.getByTestId("diag-loading")).toBeInTheDocument();
  });

  it("shows the unreachable message when diag is null", () => {
    render(<DiagnosticsBody loading={false} diag={null} />);
    const node = screen.getByTestId("diag-unreachable");
    expect(node).toBeInTheDocument();
    expect(node.textContent).toMatch(/Couldn't reach/i);
    expect(node.textContent).toMatch(/VITE_API_URL/);
  });

  it("renders a full diagnostics body when all fields are present", () => {
    const diag: EnvDiagnosticsResponse = {
      ok: true,
      hostname: "reel-flow-api.onrender.com",
      nodeEnv: "production",
      allowedOrigins: ["https://reel-flow.onrender.com"],
      present: { NODE_ENV: true, PORT: true, ALLOWED_ORIGINS: false },
    };
    render(<DiagnosticsBody loading={false} diag={diag} />);
    expect(screen.getByTestId("diag-body")).toBeInTheDocument();
    expect(screen.queryByTestId("diag-missing-fields")).not.toBeInTheDocument();
    expect(screen.getByText("reel-flow-api.onrender.com")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("https://reel-flow.onrender.com")).toBeInTheDocument();
    expect(screen.getByText("NODE_ENV")).toBeInTheDocument();
  });

  it("shows a 'missing fields' warning when hostname/origins are absent", () => {
    const diag: EnvDiagnosticsResponse = {
      ok: true,
      hostname: null,
      nodeEnv: "production",
      allowedOrigins: [],
      present: { NODE_ENV: true },
    };
    render(<DiagnosticsBody loading={false} diag={diag} />);
    const warn = screen.getByTestId("diag-missing-fields");
    expect(warn).toBeInTheDocument();
    expect(warn.textContent).toMatch(/hostname/);
    expect(warn.textContent).toMatch(/allowedOrigins/);
    expect(warn.textContent).not.toMatch(/nodeEnv/);
    expect(warn.textContent).not.toMatch(/\bpresent\b/);
  });

  it("flags an empty present map as missing", () => {
    const diag: EnvDiagnosticsResponse = {
      ok: true,
      hostname: "h",
      nodeEnv: "production",
      allowedOrigins: ["https://x"],
      present: {},
    };
    render(<DiagnosticsBody loading={false} diag={diag} />);
    const warn = screen.getByTestId("diag-missing-fields");
    expect(warn.textContent).toMatch(/present/);
    expect(screen.getByText(/No env keys reported/i)).toBeInTheDocument();
  });
});
