import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT || "3211");
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const devCommand =
  process.platform === "win32" ? `set PORT=${port}&& pnpm dev` : `PORT=${port} pnpm dev`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: devCommand,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000,
      },
});
