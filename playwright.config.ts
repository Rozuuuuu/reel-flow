import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for layout/overlap regressions.
 * Runs against a locally served Vite preview build.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone-14-pro", use: { ...devices["iPhone 14 Pro"] } },
    { name: "iphone-se", use: { ...devices["iPhone SE"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
