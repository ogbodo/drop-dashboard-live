import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * Playwright e2e config for the Drop admin dashboard.
 *
 * The dashboard is a Next.js app whose `next dev` server boots only when the
 * NEXT_PUBLIC_SUPABASE_* env vars are present (see lib/env.ts). The webServer
 * block below launches it on a dedicated port and reuses an already-running
 * instance when one is found, so local iteration stays fast.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
