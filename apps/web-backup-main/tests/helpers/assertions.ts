/**
 * Shared E2E assertions. Use for consistent page-load checks across smoke and feature specs.
 */
import { Page, expect } from "@playwright/test";

const DEFAULT_TIMEOUT = 10000;

/**
 * Asserts the main landmark is visible. Use after navigation for stable, consistent timeout.
 */
export async function assertMainVisible(page: Page, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await expect(page.locator("main")).toBeVisible({ timeout });
}

/**
 * Asserts a list-style page loaded: main visible, then heading visible (role or text in main).
 * Use for /cases, /providers, /records-requests to avoid brittle getByText().first() across the whole page.
 */
export async function assertListPageLoaded(
  page: Page,
  headingNameOrRegex: string | RegExp,
  timeout = DEFAULT_TIMEOUT
): Promise<void> {
  await expect(page.locator("main")).toBeVisible({ timeout });
  const heading = page.getByRole("heading", { name: headingNameOrRegex });
  const headingInMain = page.locator("main").getByText(headingNameOrRegex);
  await expect(heading.or(headingInMain)).toBeVisible({ timeout });
}

/**
 * Asserts the review queue page loaded: heading visible and table (with optional empty state).
 * Use in smoke pack and review_queue.spec to avoid duplication.
 */
export async function assertReviewPageLoaded(page: Page, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible({ timeout });
  const table = page.locator("main table").first();
  await expect(table).toBeVisible({ timeout });
  const rowCount = await page.locator("tbody tr").count();
  const emptyMsg = page.getByText(/no documents/i);
  const hasEmpty = await emptyMsg.isVisible();
  expect(rowCount > 0 || hasEmpty).toBeTruthy();
}

/**
 * Asserts main is visible and contains at least one of the given strings (for resilient page-load checks).
 */
export async function assertMainVisibleWithOneOf(
  page: Page,
  patterns: string[],
  timeout = DEFAULT_TIMEOUT
): Promise<void> {
  await expect(page.locator("main")).toBeVisible({ timeout });
  const content = await page.locator("main").textContent();
  const found = patterns.some((p) => content?.includes(p));
  expect(found).toBeTruthy();
}

/**
 * Asserts an admin page loaded: main visible and one of the patterns (or "Admin" link text).
 * Use for admin routes that show "← Admin" and a page-specific heading.
 */
export async function assertAdminPageLoaded(
  page: Page,
  patterns: string[],
  timeout = DEFAULT_TIMEOUT
): Promise<void> {
  await assertMainVisibleWithOneOf(page, ["Admin", ...patterns], timeout);
}

/**
 * Waits for the review queue toast (role="status") to show a message matching the pattern.
 * Use after confirm/reject/route actions instead of fixed waitForTimeout.
 */
export async function waitForReviewQueueToast(
  page: Page,
  pattern: string | RegExp,
  timeout = 5000
): Promise<void> {
  await expect(page.getByRole("status").filter({ hasText: pattern })).toBeVisible({ timeout });
}
