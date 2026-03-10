import { test, expect } from "@playwright/test";
import { goToReview } from "./helpers/nav";
import { assertReviewPageLoaded, waitForReviewQueueToast } from "./helpers/assertions";

test.describe("Review Queue", () => {
  test.beforeEach(async ({ page }) => {
    await goToReview(page);
  });

  test("1) Load /dashboard/review and verify table loads", async ({ page }) => {
    await assertReviewPageLoaded(page);
    const header = page.locator("thead th").first();
    await expect(header).toBeVisible();
  });

  test("2) Table has columns or empty state", async ({ page }) => {
    await assertReviewPageLoaded(page);
  });

  test("3) Click Preview when a row exists", async ({ page }) => {
    const previewBtn = page.getByRole("button", { name: /preview/i }).first();
    const count = await previewBtn.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await previewBtn.click();
    await expect(page.getByText(/preview/i).first()).toBeVisible();
    const closeBtn = page.getByRole("button", { name: /close/i }).or(page.locator("[aria-label='Close preview']")).first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    }
  });

  test("4) Confirm document (when row with suggested case exists)", async ({ page }) => {
    const confirmBtn = page.getByRole("button", { name: /confirm/i }).first();
    if (await confirmBtn.count() === 0) {
      test.skip();
      return;
    }
    const disabled = await confirmBtn.isDisabled();
    if (disabled) {
      test.skip();
      return;
    }
    await confirmBtn.click();
    await waitForReviewQueueToast(page, /Confirmed/, 5000);
  });

  test("5) Reject document", async ({ page }) => {
    const rejectBtn = page.getByRole("button", { name: /reject/i }).first();
    if (await rejectBtn.count() === 0) {
      test.skip();
      return;
    }
    const disabled = await rejectBtn.isDisabled();
    if (disabled) {
      test.skip();
      return;
    }
    await rejectBtn.click();
    await waitForReviewQueueToast(page, /Rejected/, 5000);
  });

  test("6) Route document (drawer route)", async ({ page }) => {
    const previewBtn = page.getByRole("button", { name: /preview/i }).first();
    if (await previewBtn.count() === 0) {
      test.skip();
      return;
    }
    await previewBtn.click();
    await expect(page.getByRole("button", { name: /route/i }).first()).toBeVisible({ timeout: 5000 });
    const routeInput = page.locator("input[type='text']").filter({ hasNotText: "" }).first();
    const routeBtn = page.getByRole("button", { name: /route/i }).first();
    if ((await routeInput.count()) > 0 && (await routeBtn.count()) > 0) {
      await routeInput.fill("test-case-1");
      await routeBtn.click();
      await waitForReviewQueueToast(page, /Routed/, 5000);
    }
  });

  test("7) Bulk confirm (select all and bulk confirm when available)", async ({ page }) => {
    const selectAll = page.locator("thead input[type='checkbox']").first();
    if (await selectAll.count() === 0) {
      test.skip();
      return;
    }
    await selectAll.click();
    const bulkConfirm = page.getByRole("button", { name: /bulk confirm/i }).first();
    if (await bulkConfirm.count() > 0 && !(await bulkConfirm.isDisabled())) {
      await bulkConfirm.click();
      await waitForReviewQueueToast(page, /Confirmed|Rejected|failed|skipped/, 10000);
    }
  });
});
