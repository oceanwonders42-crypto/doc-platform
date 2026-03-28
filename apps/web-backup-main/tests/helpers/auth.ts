/**
 * Auth helpers for E2E. App uses API-key auth (no login form).
 * "Login" = ensure dashboard loads (valid DOC_API_KEY in env for the running app).
 */
import { Page, expect, test } from "@playwright/test";

const DASHBOARD_URL = "/dashboard";
const TIMEOUT = 15000;

/**
 * Go to dashboard and assert the app loaded (content or known env error).
 * Use as "login" step before other tests.
 */
export async function gotoDashboardAndAssertLoaded(page: Page): Promise<void> {
  await page.goto(DASHBOARD_URL);
  const heading = page.getByRole("heading", { name: /dashboard/i }).or(page.getByText(/Doc Platform/i));
  await expect(heading).toBeVisible({ timeout: TIMEOUT });
  const body = await page.locator("body").textContent();
  const hasError = body?.includes("Missing DOC_API") ?? false;
  const hasContent = (body?.includes("Recent documents") || body?.includes("Doc Platform")) ?? false;
  expect(hasContent || hasError).toBeTruthy();
}

/**
 * Go to dashboard and skip the current test if demo env is unavailable (missing DOC_API / API).
 * Use at the start of seeded regression tests. Call after gotoDashboardAndAssertLoaded if you already loaded dashboard.
 */
export async function skipWhenDemoEnvUnavailable(page: Page): Promise<void> {
  if (await isDashboardEnvError(page)) {
    test.skip();
  }
}

/**
 * Go to dashboard and skip if demo env unavailable. Use at the start of each seeded regression flow.
 * Equivalent to gotoDashboardAndAssertLoaded(page) then skipWhenDemoEnvUnavailable(page).
 */
export async function ensureSeededDashboard(page: Page): Promise<void> {
  await gotoDashboardAndAssertLoaded(page);
  skipWhenDemoEnvUnavailable(page);
}

/**
 * Returns true if the page shows the "missing API key" style error (dashboard not usable).
 */
export async function isDashboardEnvError(page: Page): Promise<boolean> {
  const body = await page.locator("body").textContent();
  return body?.includes("Missing DOC_API") ?? false;
}
